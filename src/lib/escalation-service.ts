import "server-only";

import { db } from "@/lib/db";
import { buildEscalationPlan, preservesLegacyQuietHours, defaultEscalationPolicy, type EscalationPolicy } from "@/lib/escalations";
import { sendWebPush } from "@/lib/push";
import { isInsideQuietHours } from "@/lib/reminders";
import { sendUrgentVoiceCall } from "@/lib/outbound-calls";
import { readAlertPolicy } from "@/lib/alert-policy";
import type { Prisma } from "@/generated/prisma/client";

const activeStatuses = ["PENDING", "PROCESSING", "READY_FOR_DEVICE", "SCHEDULED"];
const cancellableStatuses = activeStatuses.filter(status => status !== "PROCESSING");

function policyFromPreference(preference: Partial<EscalationPolicy> | null): EscalationPolicy {
  return { ...defaultEscalationPolicy, ...(preference || {}) };
}

async function cancelStaleAttempts(userId: string, now: Date) {
  const active = await db.escalationAttempt.findMany({
    where: { userId, status: { in: cancellableStatuses } },
    include: { task: { select: { priority: true, status: true, dueAt: true } } },
  });
  const staleIds = active.filter(({ task }) => task.priority !== "URGENT" || !["TODO", "IN_PROGRESS"].includes(task.status) || !task.dueAt || task.dueAt > now).map(({ id }) => id);
  if (staleIds.length) await db.escalationAttempt.updateMany({ where: { id: { in: staleIds } }, data: { status: "CANCELLED" } });
}

type QuietHours = { timezone: string; quietHoursStartsAt: string; quietHoursEndsAt: string };

async function seedPlans(userId: string, now: Date, policy: EscalationPolicy) {
  if (!policy.urgentEscalationEnabled) return;
  const tasks = await db.task.findMany({
    where: { userId, priority: "URGENT", status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lte: now } },
    select: { id: true },
  });
  for (const candidate of tasks) await db.$transaction(async tx => {
    // Re-read authorization and scheduling state in the same transaction as inserts.
    // Otherwise a concurrent due-date edit can be hidden by a stale chain's createdAt.
    const task = await tx.task.findFirst({ where: { id: candidate.id, userId, priority: "URGENT", status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lte: now } }, select: { id: true, alertPolicy: true } });
    if (!task) return;
    const currentPolicy = policyFromPreference(await tx.userPreference.findUnique({ where: { userId } }));
    if (!currentPolicy.urgentEscalationEnabled) return;
    const approved = readAlertPolicy(task.alertPolicy);
    if(approved && !approved.escalation)return;
    const taskPolicy = approved ? { ...currentPolicy, urgentRepeatMinutes: approved.repeatMinutes, urgentMaxRepeats: approved.repeatCount, androidAlarmEnabled: approved.channels.includes("ALARM"), highPriorityEnabled: approved.channels.includes("PUSH"), smsEscalationEnabled: false, callEscalationEnabled: false } : currentPolicy;
    const active = await tx.escalationAttempt.findFirst({ where: { taskId: task.id, userId, status: { in: activeStatuses } }, select: { id: true } });
    if (active) return;
    const latest = await tx.escalationAttempt.findFirst({where:{taskId:task.id,userId},orderBy:{createdAt:"desc"},select:{createdAt:true}});
    // updatedAt also changes on a title edit. A completed chain needs a new,
    // owned schedule-change receipt; preferences/title/no-op saves cannot rearm it.
    const scheduleReceipt = latest ? await tx.auditLog.findFirst({
      where: { userId, entityId: task.id, createdAt: { gte: latest.createdAt }, result: { contains: '"escalationScheduleChanged":true' }, OR: [
        { action: "TASK_UPDATED", entityType: "Task" },
        { action: "AGENT_UPDATE", entityType: "TASK", source: "CONFIRMED_AGENT" },
      ] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, result: true },
    }) : null;
    if (latest && (!scheduleReceipt || storedMetadata(scheduleReceipt.result).escalationScheduleChanged !== true)) return;
    if (scheduleReceipt && await tx.escalationAttempt.findFirst({ where: { userId, taskId: task.id, metadata: { contains: `"scheduleChangeReceiptId":${JSON.stringify(scheduleReceipt.id)}` } }, select: { id: true } })) return;
    let previousAlertAt = now;
    const spacing = Math.max(10, taskPolicy.urgentRepeatMinutes) * 60_000;
    const plan = buildEscalationPlan(now, taskPolicy).filter(entry => !approved || entry.level !== "IN_APP_PUSH" || approved.channels.some(c=>c==="IN_APP"||c==="PUSH")).map((entry) => {
      if (entry.level === "IN_APP_PUSH" || taskPolicy.urgentMaxRepeats === 0) return entry;
      const spaced = new Date(Math.max(entry.scheduledFor.getTime(), previousAlertAt.getTime() + spacing));
      const scheduledFor = spaced; // Newly created attempts never shift for retired quiet hours.
      previousAlertAt = scheduledFor;
      return { ...entry, scheduledFor };
    });
    for (const entry of plan) {
      // Stable across concurrent runs and intervening title changes for the same authorization.
      const idempotencyKey = `${userId}:${task.id}:${scheduleReceipt ? `change:${scheduleReceipt.id}` : "initial"}:${entry.level}:${entry.attemptNumber}`;
      await tx.escalationAttempt.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          userId,
          taskId: task.id,
          level: entry.level,
          attemptNumber: entry.attemptNumber,
          scheduledFor: entry.scheduledFor,
          provider: entry.provider,
          status: entry.level === "ANDROID_ALARM" ? "READY_FOR_DEVICE" : "PENDING",
          idempotencyKey,
          metadata: JSON.stringify({ quietHoursRetired: true, ...(scheduleReceipt ? { scheduleChangeReceiptId: scheduleReceipt.id } : {}), ...(taskPolicy.urgentMaxRepeats === 0 && entry.level === "ANDROID_ALARM" ? { initialDeliveryGraceMs: 10_000 } : {}) }),
        },
      });
    }
  });
}

const uncertainPush = "PUSH_DELIVERY_UNCERTAIN", uncertainCall = "CALL_DELIVERY_UNCERTAIN";
function storedMetadata(value: string | null): Record<string, unknown> {
  try { const parsed = JSON.parse(value ?? "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

async function currentAttempt(tx: Prisma.TransactionClient, id: string, userId: string, status: string, lastError?: string) {
  const attempt = await tx.escalationAttempt.findFirst({ where: { id, userId, status, ...(lastError ? { lastError } : {}) }, include: { task: true, user: { include: { pushSubscriptions: true } } } });
  if (!attempt) return null;
  const preference = await tx.userPreference.findUnique({ where: { userId } });
  const policy = policyFromPreference(preference), approved = readAlertPolicy(attempt.task.alertPolicy);
  const active = attempt.task.userId === userId && attempt.task.priority === "URGENT" && ["TODO", "IN_PROGRESS"].includes(attempt.task.status) && !!attempt.task.dueAt && attempt.task.dueAt <= new Date()
    && policy.urgentEscalationEnabled && (!approved || approved.escalation)
    && (attempt.level !== "HIGH_PRIORITY" || (approved ? approved.channels.includes("PUSH") : policy.highPriorityEnabled))
    && (!(attempt.level === "CALL" || attempt.level === "CALL_MOCK") || (!approved && policy.callEscalationEnabled))
    && (attempt.level !== "SMS_MOCK" || (!approved && policy.smsEscalationEnabled));
  return { attempt, preference, approved, active };
}

async function externalAttempt(id: string, userId: string, marker: string, settlement?: Prisma.EscalationAttemptUpdateManyMutationInput, audit?: { action: string; result: string }) {
  return db.$transaction(async tx => {
    const where = { id, userId, status: "PARTIAL", lastError: marker };
    const current = await currentAttempt(tx, id, userId, "PARTIAL", marker);
    if (!current) return null;
    const suppressPush = marker === uncertainPush && (!!(current.approved && !current.approved.channels.includes("PUSH")) || (preservesLegacyQuietHours(current.attempt.metadata) && current.attempt.level === "IN_APP_PUSH" && isInsideQuietHours(new Date(), current.approved?.quietStart ?? current.preference?.quietHoursStartsAt ?? "22:00", current.approved?.quietEnd ?? current.preference?.quietHoursEndsAt ?? "08:00", current.approved?.timezone ?? current.preference?.timezone ?? "Asia/Tehran")));
    if (!current.active || suppressPush) {
      await tx.escalationAttempt.updateMany({ where, data: { status: "CANCELLED" } });
      return null;
    }
    if (settlement) {
      const saved = await tx.escalationAttempt.updateMany({ where, data: settlement });
      if (!saved.count) return null;
      if (audit) await tx.auditLog.create({ data: { userId, entityType: "EscalationAttempt", entityId: id, source: "SYSTEM", ...audit } });
    }
    return current;
  });
}

async function processDueAttempts(userId: string, now: Date, quietHours: QuietHours) {
  const due = await db.escalationAttempt.findMany({
    where: { userId, status: "PENDING", scheduledFor: { lte: now } },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });
  let sent = 0, failed = 0;
  for (const attempt of due) {
    try {
      const prepared = await db.$transaction(async tx => {
        const current = await currentAttempt(tx, attempt.id, userId, "PENDING");
        if (!current) return null;
        const where = { id: attempt.id, userId, status: "PENDING" };
        if (!current.active) { await tx.escalationAttempt.updateMany({ where, data: { status: "CANCELLED" } }); return null; }
        const row = current.attempt, approved = current.approved;
        const metadata = storedMetadata(row.metadata);
        const call = row.level === "CALL" || row.level === "CALL_MOCK";
        const sms = row.level === "SMS_MOCK";
        const suppressPush = !!(approved && !approved.channels.includes("PUSH")) || (preservesLegacyQuietHours(row.metadata) && row.level === "IN_APP_PUSH" && isInsideQuietHours(now, approved?.quietStart ?? current.preference?.quietHoursStartsAt ?? quietHours.quietHoursStartsAt, approved?.quietEnd ?? current.preference?.quietHoursEndsAt ?? quietHours.quietHoursEndsAt, approved?.timezone ?? current.preference?.timezone ?? quietHours.timezone));
        const external = !sms && (call || (!suppressPush && row.user.pushSubscriptions.length > 0));
        const marker = call ? uncertainCall : uncertainPush;
        const status = sms ? "SIMULATED" : call || !suppressPush ? "PARTIAL" : "SENT";
        const claimed = await tx.escalationAttempt.updateMany({ where, data: {
          status, sentAt: status === "SENT" || sms ? now : null,
          lastError: external ? marker : status === "PARTIAL" ? "PUSH_NOT_SENT_NO_SUBSCRIPTIONS" : null,
          metadata: JSON.stringify({ ...metadata, ...(sms ? { transmitted: false, reason: "External provider requires explicit approval" } : suppressPush && !call ? { pushSuppressed: true } : {}) }),
        } });
        if (!claimed.count) return null;
        if (sms) {
          await tx.auditLog.create({ data: { userId, action: "SMS_MOCK_SIMULATED", entityType: "EscalationAttempt", entityId: row.id, source: "SYSTEM", result: JSON.stringify({ transmitted: false }) } });
        } else if (!call) {
          const highPriority = row.level === "HIGH_PRIORITY", id = `escalation:${row.id}`;
          await tx.notification.upsert({ where: { id }, update: {}, create: { id, userId, title: highPriority ? "هشدار جدی: کار فوری عقب‌افتاده" : "کار فوری از موعد گذشته است", body: row.task.title, type: highPriority ? "URGENT_ESCALATION" : "URGENT_REMINDER" } });
        }
        return { external, marker, call, status };
      });
      if (!prepared) continue;
      if (!prepared.external) { if (prepared.status === "PARTIAL") failed++; else sent++; continue; }
      // Recheck completion, ownership and current user policy after commit and before egress.
      const current = await externalAttempt(attempt.id, userId, prepared.marker);
      if (!current) continue;
      if (prepared.call) {
        const delivery = await sendUrgentVoiceCall(current.preference?.emergencyPhone);
        const status = delivery.transmitted ? "SENT" : "SIMULATED";
        const metadata = JSON.stringify({ ...storedMetadata(current.attempt.metadata), transmitted: delivery.transmitted, provider: delivery.provider, reason: delivery.reason, providerReference: delivery.providerReference });
        const settled = await externalAttempt(attempt.id, userId, prepared.marker, { status, provider: delivery.provider.toUpperCase(), sentAt: new Date(), lastError: null, metadata }, { action: delivery.transmitted ? "CALL_SENT" : "CALL_SIMULATED", result: JSON.stringify({ transmitted: delivery.transmitted, provider: delivery.provider, reason: delivery.reason }) });
        if (settled) sent++;
        continue;
      }
      const highPriority = current.attempt.level === "HIGH_PRIORITY";
      const results = await Promise.allSettled(current.attempt.user.pushSubscriptions.map((subscription) => sendWebPush(subscription, {
        title: highPriority ? "هشدار جدی همراه" : "کار فوری عقب‌افتاده",
        body: current.attempt.task.title,
        url: "/",
        tag: attempt.id,
        urgent: highPriority,
      })));
      const targets = results.map((result, index) => ({ id: current.attempt.user.pushSubscriptions[index].id, status: result.status === "rejected" ? "DELIVERY_UNCERTAIN" : result.value.sent ? "SENT" : "NOT_SENT" }));
      const successful = targets.length > 0 && targets.every(target => target.status === "SENT");
      const settled = await externalAttempt(attempt.id, userId, prepared.marker, { status: successful ? "SENT" : "PARTIAL", sentAt: successful ? new Date() : null, lastError: JSON.stringify({ push: targets, ...(targets.length ? {} : { reason: "NO_SUBSCRIPTIONS" }) }) });
      if (settled) { if (successful) sent++; else failed++; }
    } catch {
      // Preserve a committed uncertainty marker. Never retry a call/push after an ambiguous result.
      failed++;
    }
  }
  return { sent, failed, uncertain: await db.escalationAttempt.count({ where: { userId, status: "PARTIAL", lastError: { contains: "DELIVERY_UNCERTAIN" } } }) };
}

export async function listNativeEscalationAlarms(userId: string, now = new Date()) {
  const attempts = await db.escalationAttempt.findMany({
    where: { userId, level: "ANDROID_ALARM", scheduledFor: { gt: now }, status: { in: ["READY_FOR_DEVICE", "SCHEDULED"] }, task: { status: { in: ["TODO", "IN_PROGRESS"] }, priority: "URGENT" } },
    include: { task: { select: { title: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });
  return attempts.map((attempt) => ({ id: attempt.id, taskId: attempt.taskId, title: attempt.task.title, level: "ANDROID_ALARM" as const, attemptNumber: attempt.attemptNumber, scheduledFor: attempt.scheduledFor.toISOString() }));
}

export async function syncUserEscalations(userId: string) {
  const now = new Date();
  const legacyProcessing = await db.escalationAttempt.count({ where: { userId, status: "PROCESSING" } });
  const preference = await db.userPreference.findUnique({ where: { userId } });
  const policy = policyFromPreference(preference);
  const quietHours = {
    timezone: preference?.timezone ?? "Asia/Tehran",
    quietHoursStartsAt: preference?.quietHoursStartsAt ?? "22:00",
    quietHoursEndsAt: preference?.quietHoursEndsAt ?? "08:00",
  };
  await cancelStaleAttempts(userId, now);
  if (!policy.urgentEscalationEnabled) {
    await db.escalationAttempt.updateMany({ where: { userId, status: { in: cancellableStatuses } }, data: { status: "CANCELLED" } });
    return { alarms: [], policy, legacyProcessing };
  }
  await seedPlans(userId, now, policy);
  const delivery = await processDueAttempts(userId, now, quietHours);
  return { alarms: await listNativeEscalationAlarms(userId), policy, legacyProcessing, delivery };
}
