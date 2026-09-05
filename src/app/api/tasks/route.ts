import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { taskInputSchema } from "@/lib/validation";
import { reminderIdempotencyKey } from "@/lib/reminders";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { buildReminderSchedule, parseStoredReminderOffsets } from "@/lib/reminder-offsets";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const tasks = await db.task.findMany({ where: { userId: session.user.id }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] });
  return Response.json({ data: tasks });
}

export async function POST(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = taskInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات کار معتبر نیست", 422, parsed.error.flatten());
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true, defaultReminderOffsets: true } });
  const { reminderMinutes, ...taskInput } = parsed.data;
  const reminderOffsets = reminderMinutes !== undefined ? [reminderMinutes] : parseStoredReminderOffsets(preference?.defaultReminderOffsets, preference?.defaultReminderMins);
  const task = await db.$transaction(async (tx) => {
    const created = await tx.task.create({ data: { ...taskInput, startAt: taskInput.startAt ? new Date(taskInput.startAt) : null, dueAt: taskInput.dueAt ? new Date(taskInput.dueAt) : null, userId: session.user.id } });
    if (created.dueAt) {
      await tx.reminder.createMany({ data: buildReminderSchedule(created.dueAt, reminderOffsets).map(({ scheduledFor }) => ({ userId: session.user.id, taskId: created.id, scheduledFor, channel: "PUSH", idempotencyKey: reminderIdempotencyKey(session.user.id, created.id, scheduledFor, "PUSH") })) });
    }
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_CREATED", entityType: "Task", entityId: created.id, input: JSON.stringify({ title: created.title, category: created.category, priority: created.priority }) } });
    return created;
  });
  return Response.json({ data: task, meta: { remindersScheduled: task.dueAt ? reminderOffsets.length : 0 } }, { status: 201 });
}
