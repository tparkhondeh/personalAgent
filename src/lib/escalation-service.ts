import "server-only";

import { db } from "@/lib/db";
import { buildEscalationPlan, defaultEscalationPolicy, escalationIdempotencyKey, type EscalationPolicy } from "@/lib/escalations";
import { sendWebPush } from "@/lib/push";
import { isInsideQuietHours, moveOutsideQuietHours } from "@/lib/reminders";
import { sendUrgentVoiceCall } from "@/lib/outbound-calls";

const activeStatuses = ["PENDING", "PROCESSING", "READY_FOR_DEVICE", "SCHEDULED"];

function policyFromPreference(preference: Partial<EscalationPolicy> | null): EscalationPolicy {
  return { ...defaultEscalationPolicy, ...(preference || {}) };
}

async function cancelStaleAttempts(userId: string, now: Date) {
  const active = await db.escalationAttempt.findMany({
    where: { userId, status: { in: activeStatuses } },
    include: { task: { select: { priority: true, status: true, dueAt: true } } },
  });
  const staleIds = active.filter(({ task }) => task.priority !== "URGENT" || !["TODO", "IN_PROGRESS"].includes(task.status) || !task.dueAt || task.dueAt > now).map(({ id }) => id);
  if (staleIds.length) await db.escalationAttempt.updateMany({ where: { id: { in: staleIds } }, data: { status: "CANCELLED" } });
}

type QuietHours = { timezone: string; quietHoursStartsAt: string; quietHoursEndsAt: string };

async function seedPlans(userId: string, now: Date, policy: EscalationPolicy, quietHours: QuietHours, policyVersion?: Date) {
  if (!policy.urgentEscalationEnabled) return;
  const tasks = await db.task.findMany({
    where: { userId, priority: "URGENT", status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lte: now } },
    select: { id: true, updatedAt: true },
  });
  for (const task of tasks) {
    const active = await db.escalationAttempt.findFirst({ where: { taskId: task.id, status: { in: activeStatuses } }, select: { id: true } });
    if (active) continue;
    let previousAlertAt = now;
    const spacing = Math.max(10, policy.urgentRepeatMinutes) * 60_000;
    const plan = buildEscalationPlan(now, policy).map((entry) => {
      if (entry.level === "IN_APP_PUSH") return entry;
      const spaced = new Date(Math.max(entry.scheduledFor.getTime(), previousAlertAt.getTime() + spacing));
      const scheduledFor = moveOutsideQuietHours(spaced, quietHours.quietHoursStartsAt, quietHours.quietHoursEndsAt, quietHours.timezone);
      previousAlertAt = scheduledFor;
      return { ...entry, scheduledFor };
    });
    await db.$transaction(plan.map((entry) => {
      const planVersion = policyVersion && policyVersion > task.updatedAt ? policyVersion : task.updatedAt;
      const idempotencyKey = escalationIdempotencyKey(userId, task.id, planVersion, entry);
      return db.escalationAttempt.upsert({
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
        },
      });
    }));
  }
}

async function processDueAttempts(userId: string, now: Date, quietHours: QuietHours, emergencyPhone?: string | null) {
  const due = await db.escalationAttempt.findMany({
    where: { userId, status: "PENDING", scheduledFor: { lte: now } },
    include: { task: { select: { title: true } }, user: { include: { pushSubscriptions: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });
  for (const attempt of due) {
    const claimed = await db.escalationAttempt.updateMany({ where: { id: attempt.id, status: "PENDING" }, data: { status: "PROCESSING" } });
    if (!claimed.count) continue;
    try {
      if (attempt.level === "SMS_MOCK") {
        await db.$transaction([
          db.escalationAttempt.update({ where: { id: attempt.id }, data: { status: "SIMULATED", sentAt: now, metadata: JSON.stringify({ transmitted: false, reason: "External provider requires explicit approval" }) } }),
          db.auditLog.create({ data: { userId, action: `${attempt.level}_SIMULATED`, entityType: "EscalationAttempt", entityId: attempt.id, source: "SYSTEM", result: JSON.stringify({ transmitted: false }) } }),
        ]);
        continue;
      }

      if (attempt.level === "CALL" || attempt.level === "CALL_MOCK") {
        const delivery = await sendUrgentVoiceCall(emergencyPhone);
        const status = delivery.transmitted ? "SENT" : "SIMULATED";
        const metadata = JSON.stringify({ transmitted: delivery.transmitted, provider: delivery.provider, reason: delivery.reason, providerReference: delivery.providerReference });
        await db.$transaction([
          db.escalationAttempt.update({ where: { id: attempt.id }, data: { status, provider: delivery.provider.toUpperCase(), sentAt: now, metadata } }),
          db.auditLog.create({ data: { userId, action: delivery.transmitted ? "CALL_SENT" : "CALL_SIMULATED", entityType: "EscalationAttempt", entityId: attempt.id, source: "SYSTEM", result: JSON.stringify({ transmitted: delivery.transmitted, provider: delivery.provider, reason: delivery.reason }) } }),
        ]);
        continue;
      }

      const highPriority = attempt.level === "HIGH_PRIORITY";
      await db.notification.create({
        data: {
          userId,
          title: highPriority ? "هشدار جدی: کار فوری عقب‌افتاده" : "کار فوری از موعد گذشته است",
          body: attempt.task.title,
          type: highPriority ? "URGENT_ESCALATION" : "URGENT_REMINDER",
        },
      });
      const suppressPush = attempt.level === "IN_APP_PUSH" && isInsideQuietHours(now, quietHours.quietHoursStartsAt, quietHours.quietHoursEndsAt, quietHours.timezone);
      const results = suppressPush ? [] : await Promise.allSettled(attempt.user.pushSubscriptions.map((subscription) => sendWebPush(subscription, {
        title: highPriority ? "هشدار جدی همراه" : "کار فوری عقب‌افتاده",
        body: attempt.task.title,
        url: "/",
        tag: attempt.id,
        urgent: highPriority,
      })));
      const failed = results.filter((result) => result.status === "rejected").length;
      await db.escalationAttempt.update({ where: { id: attempt.id }, data: { status: failed ? "PARTIAL" : "SENT", sentAt: now, lastError: failed ? `${failed} push delivery failed` : null, metadata: suppressPush ? JSON.stringify({ pushSuppressedByQuietHours: true }) : null } });
    } catch (error) {
      await db.escalationAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" } });
    }
  }
}

export async function listNativeEscalationAlarms(userId: string) {
  const attempts = await db.escalationAttempt.findMany({
    where: { userId, level: "ANDROID_ALARM", status: { in: ["READY_FOR_DEVICE", "SCHEDULED"] }, task: { status: { in: ["TODO", "IN_PROGRESS"] }, priority: "URGENT" } },
    include: { task: { select: { title: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });
  return attempts.map((attempt) => ({ id: attempt.id, taskId: attempt.taskId, title: attempt.task.title, level: "ANDROID_ALARM" as const, attemptNumber: attempt.attemptNumber, scheduledFor: attempt.scheduledFor.toISOString() }));
}

export async function syncUserEscalations(userId: string) {
  const now = new Date();
  const preference = await db.userPreference.findUnique({ where: { userId } });
  const policy = policyFromPreference(preference);
  const quietHours = {
    timezone: preference?.timezone ?? "Asia/Tehran",
    quietHoursStartsAt: preference?.quietHoursStartsAt ?? "22:00",
    quietHoursEndsAt: preference?.quietHoursEndsAt ?? "08:00",
  };
  await cancelStaleAttempts(userId, now);
  if (!policy.urgentEscalationEnabled) {
    await db.escalationAttempt.updateMany({ where: { userId, status: { in: activeStatuses } }, data: { status: "CANCELLED" } });
    return { alarms: [], policy };
  }
  await seedPlans(userId, now, policy, quietHours, preference?.updatedAt);
  await processDueAttempts(userId, now, quietHours, preference?.emergencyPhone);
  return { alarms: await listNativeEscalationAlarms(userId), policy };
}
