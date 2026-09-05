import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validation";
import { reminderIdempotencyKey, shouldScheduleTaskReminder } from "@/lib/reminders";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { buildReminderSchedule, parseStoredReminderOffsets } from "@/lib/reminder-offsets";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  const existing = await db.task.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return jsonError("کار پیدا نشد", 404);
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true, defaultReminderOffsets: true } });
  const parsed = taskUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات کار معتبر نیست", 422, parsed.error.flatten());
  const { reminderMinutes, ...updates } = parsed.data;
  const data = {
    ...updates,
    startAt: updates.startAt === null ? null : updates.startAt ? new Date(updates.startAt) : undefined,
    dueAt: updates.dueAt === null ? null : updates.dueAt ? new Date(updates.dueAt) : undefined,
    completedAt: updates.status === "DONE" ? new Date() : updates.status ? null : undefined,
  };
  const task = await db.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id }, data });
    if (updates.dueAt !== undefined || updates.status !== undefined || updates.priority !== undefined) {
      await tx.escalationAttempt.updateMany({ where: { taskId: id, status: { in: ["PENDING", "PROCESSING", "READY_FOR_DEVICE", "SCHEDULED"] } }, data: { status: "CANCELLED" } });
    }
    if (updates.dueAt !== undefined || reminderMinutes !== undefined || updates.status !== undefined) {
      await tx.reminder.deleteMany({ where: { taskId: id } });
      if (shouldScheduleTaskReminder(updated) && updated.dueAt) {
        const offsets = reminderMinutes !== undefined ? [reminderMinutes] : parseStoredReminderOffsets(preference?.defaultReminderOffsets, preference?.defaultReminderMins);
        await tx.reminder.createMany({ data: buildReminderSchedule(updated.dueAt, offsets).map(({ scheduledFor }) => ({ userId: session.user.id, taskId: id, scheduledFor, channel: "PUSH", idempotencyKey: reminderIdempotencyKey(session.user.id, id, scheduledFor, "PUSH") })) });
      }
    }
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_UPDATED", entityType: "Task", entityId: id, input: JSON.stringify(parsed.data) } });
    return updated;
  });
  return Response.json({ data: task });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  const existing = await db.task.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return jsonError("کار پیدا نشد", 404);
  await db.$transaction(async (tx) => {
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_DELETED", entityType: "Task", entityId: id, input: JSON.stringify({ title: existing.title }) } });
    await tx.task.delete({ where: { id } });
  });
  return new Response(null, { status: 204 });
}
