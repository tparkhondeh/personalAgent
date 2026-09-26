import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { validAgentOrigin } from "@/lib/agent-origin";
import { taskInputSchema } from "@/lib/validation";
import { reminderIdempotencyKey } from "@/lib/reminders";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { futureReminderSchedule, parseStoredReminderOffsets } from "@/lib/reminder-offsets";
import { manualReminderPolicy } from "@/lib/stored-reminder-schedule";
import { createExactlyOnce, createFailure, createRequestIdentity } from "@/lib/create-request";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const tasks = await db.task.findMany({ where: { userId: session.user.id, status: { not: "CANCELLED" } }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] });
  return Response.json({ data: tasks });
}

export async function POST(request: Request) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = taskInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات کار معتبر نیست", 422, parsed.error.flatten());
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true, defaultReminderOffsets: true } });
  const { reminderMinutes, ...taskInput } = parsed.data;
  const reminderOffsets = reminderMinutes !== undefined ? [reminderMinutes] : parseStoredReminderOffsets(preference?.defaultReminderOffsets, preference?.defaultReminderMins);
  try {
  const identity = createRequestIdentity(request.headers.get("idempotency-key"), session.user.id, "Task", parsed.data);
  const task = await createExactlyOnce(db, identity, async (tx) => {
    const created = await tx.task.create({ data: { ...taskInput, alertPolicy: reminderMinutes === undefined ? undefined : manualReminderPolicy(reminderMinutes), startAt: taskInput.startAt ? new Date(taskInput.startAt) : null, dueAt: taskInput.dueAt ? new Date(taskInput.dueAt) : null, userId: session.user.id } });
    if (created.dueAt) {
      const schedule = futureReminderSchedule(created.dueAt, reminderOffsets);
      if (schedule.length) await tx.reminder.createMany({ data: schedule.map(({ scheduledFor }) => ({ userId: session.user.id, taskId: created.id, scheduledFor, channel: "PUSH", idempotencyKey: reminderIdempotencyKey(session.user.id, created.id, scheduledFor, "PUSH") })) });
    }
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_CREATED", entityType: "Task", entityId: created.id, input: JSON.stringify({ title: created.title, category: created.category, priority: created.priority }) } });
    return created;
  }, (tx, id) => tx.task.findFirst({ where: { id, userId: session.user.id } }));
  const remindersScheduled = await db.reminder.count({ where: { userId: session.user.id, taskId: task.id, status: { in: ["PENDING", "DEVICE_PENDING"] } } });
  return Response.json({ data: task, meta: { remindersScheduled } }, { status: 201 });
  } catch (error) { return createFailure(error); }
}
