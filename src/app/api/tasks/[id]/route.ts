import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { validAgentOrigin } from "@/lib/agent-origin";
import { taskUpdateSchema } from "@/lib/validation";
import { reminderIdempotencyKey, shouldScheduleTaskReminder } from "@/lib/reminders";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { parseStoredReminderOffsets } from "@/lib/reminder-offsets";
import { storedReminderSchedule } from "@/lib/stored-reminder-schedule";
import { readAlertPolicy } from "@/lib/alert-policy";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  const parsed = taskUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات کار معتبر نیست", 422, parsed.error.flatten());
  const { reminderMinutes, ...updates } = parsed.data;
  return db.$transaction(async (tx) => {
    const owned = { id, userId: session.user.id };
    const existing = await tx.task.findFirst({ where: owned });
    if (!existing) return jsonError("کار پیدا نشد", 404);
    const oldPolicy = readAlertPolicy(existing.alertPolicy);
    const updated = await tx.task.update({ where: owned, data: {
      ...updates,
      alertPolicy: oldPolicy && reminderMinutes !== undefined ? JSON.stringify({ ...oldPolicy, reminderOffsets: [reminderMinutes] }) : undefined,
      startAt: updates.startAt === null ? null : updates.startAt ? new Date(updates.startAt) : undefined,
      dueAt: updates.dueAt === null ? null : updates.dueAt ? new Date(updates.dueAt) : undefined,
      completedAt: updates.status === "DONE" ? existing.completedAt ?? new Date() : updates.status ? null : undefined,
    } });
    const meta = { cancelledDeviceReminderIds: [] as string[], cancelledEscalationAttemptIds: [] as string[] };
    const wasActive = shouldScheduleTaskReminder(existing), active = shouldScheduleTaskReminder(updated);
    const dueChanged = existing.dueAt?.getTime() !== updated.dueAt?.getTime();
    const escalationScheduleChanged = dueChanged || wasActive !== active || existing.priority !== updated.priority;
    if (escalationScheduleChanged || !active) {
      meta.cancelledEscalationAttemptIds = (await tx.escalationAttempt.findMany({ where: { taskId: id, userId: session.user.id, level: "ANDROID_ALARM" }, select: { id: true } })).map(row => row.id);
      await tx.escalationAttempt.updateMany({ where: { taskId: id, userId: session.user.id, status: { in: ["PENDING", "PROCESSING", "READY_FOR_DEVICE", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
    }
    if (dueChanged || reminderMinutes !== undefined || wasActive !== active || !active) {
      const previous = await tx.reminder.findMany({ where: { taskId: id, userId: session.user.id }, select: { id: true, channel: true, status: true, scheduledFor: true } });
      const preference = active ? await tx.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true, defaultReminderOffsets: true } }) : null;
      const offsets = parseStoredReminderOffsets(preference?.defaultReminderOffsets, preference?.defaultReminderMins);
      const now = new Date();
      const schedule = active && updated.dueAt ? storedReminderSchedule(updated.dueAt, updated.alertPolicy, offsets, reminderMinutes).filter(row => row.scheduledFor > now) : [];
      const sameSlot = (a: { channel: string; scheduledFor: Date }, b: { channel: string; scheduledFor: Date }) => a.channel === b.channel && a.scheduledFor.getTime() === b.scheduledFor.getTime();
      const cancelled = previous.filter(row => ["PENDING", "DEVICE_PENDING", "PROCESSING"].includes(row.status) && !schedule.some(slot => sameSlot(row, slot)));
      // Return historical device IDs on repeated completion, too: the first response may have been lost.
      meta.cancelledDeviceReminderIds = (active ? cancelled : previous).filter(row => ["ALARM", "NATIVE"].includes(row.channel)).map(row => row.id);
      if (cancelled.length) await tx.reminder.updateMany({ where: { id: { in: cancelled.map(row => row.id) }, userId: session.user.id, taskId: id, status: { in: ["PENDING", "DEVICE_PENDING", "PROCESSING"] } }, data: { status: "CANCELLED" } });
      // Keep matching pending rows and delivery history; never replay an attempted slot.
      const additions = schedule.filter(slot => !previous.some(row => row.status !== "CANCELLED" && sameSlot(row, slot)));
      if (additions.length) await tx.reminder.createMany({ data: additions.map(row => ({ ...row, userId: session.user.id, taskId: id, idempotencyKey: `${reminderIdempotencyKey(session.user.id, id, row.scheduledFor, row.channel)}:${updated.updatedAt.toISOString()}` })) });
    }
    // Retry responses must retain owned cancellation IDs even when the schedule is now unchanged.
    const cancelledDevices = await tx.reminder.findMany({ where: { taskId: id, userId: session.user.id, status: "CANCELLED", channel: { in: ["ALARM", "NATIVE"] } }, select: { id: true } });
    const cancelledEscalations = await tx.escalationAttempt.findMany({ where: { taskId: id, userId: session.user.id, status: "CANCELLED", level: "ANDROID_ALARM" }, select: { id: true } });
    meta.cancelledDeviceReminderIds = [...new Set([...meta.cancelledDeviceReminderIds, ...cancelledDevices.map(row => row.id)])];
    meta.cancelledEscalationAttemptIds = [...new Set([...meta.cancelledEscalationAttemptIds, ...cancelledEscalations.map(row => row.id)])];
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_UPDATED", entityType: "Task", entityId: id, input: JSON.stringify(parsed.data), result: escalationScheduleChanged ? JSON.stringify({ escalationScheduleChanged: true }) : undefined } });
    return Response.json({ data: updated, meta });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  return db.$transaction(async (tx) => {
    const owned = { id, userId: session.user.id };
    const existing = await tx.task.findFirst({ where: owned });
    if (!existing) {
      const receipt = await tx.auditLog.findFirst({ where: { userId: session.user.id, entityId: id, entityType: "Task", action: "TASK_DELETED" }, orderBy: { createdAt: "desc" }, select: { result: true } });
      try {
        const saved = JSON.parse(receipt?.result ?? "null");
        const cancelledDeviceReminderIds = saved?.cancelledDeviceReminderIds, cancelledEscalationAttemptIds = saved?.cancelledEscalationAttemptIds;
        if ([cancelledDeviceReminderIds, cancelledEscalationAttemptIds].every(ids => Array.isArray(ids) && ids.every((value: unknown) => typeof value === "string"))) {
          return Response.json({ data: { id, deleted: true }, meta: { cancelledDeviceReminderIds, cancelledEscalationAttemptIds } });
        }
      } catch { /* Legacy receipts without valid cancellation metadata cannot be replayed. */ }
      return jsonError("کار پیدا نشد", 404);
    }
    const cancelledDeviceReminderIds = (await tx.reminder.findMany({ where: { taskId: id, userId: session.user.id, channel: { in: ["ALARM", "NATIVE"] } }, select: { id: true } })).map(row => row.id);
    const cancelledEscalationAttemptIds = (await tx.escalationAttempt.findMany({ where: { taskId: id, userId: session.user.id, level: "ANDROID_ALARM" }, select: { id: true } })).map(row => row.id);
    const meta = { cancelledDeviceReminderIds, cancelledEscalationAttemptIds };
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_DELETED", entityType: "Task", entityId: id, input: JSON.stringify({ title: existing.title }), result: JSON.stringify(meta) } });
    await tx.task.delete({ where: owned });
    return Response.json({ data: { id, deleted: true }, meta });
  });
}
