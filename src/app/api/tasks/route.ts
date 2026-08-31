import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { taskInputSchema } from "@/lib/validation";
import { reminderIdempotencyKey } from "@/lib/reminders";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const tasks = await db.task.findMany({ where: { userId: session.user.id }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] });
  return Response.json({ data: tasks });
}

export async function POST(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const parsed = taskInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات کار معتبر نیست", 422, parsed.error.flatten());
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true } });
  const task = await db.$transaction(async (tx) => {
    const { reminderMinutes, ...input } = parsed.data;
    const created = await tx.task.create({ data: { ...input, startAt: input.startAt ? new Date(input.startAt) : null, dueAt: input.dueAt ? new Date(input.dueAt) : null, userId: session.user.id } });
    if (created.dueAt) {
      const scheduledFor = new Date(created.dueAt.getTime() - (reminderMinutes ?? preference?.defaultReminderMins ?? 15) * 60_000);
      await tx.reminder.create({ data: { userId: session.user.id, taskId: created.id, scheduledFor, channel: "PUSH", idempotencyKey: reminderIdempotencyKey(session.user.id, created.id, scheduledFor, "PUSH") } });
    }
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_CREATED", entityType: "Task", entityId: created.id, input: JSON.stringify({ title: created.title, category: created.category, priority: created.priority }) } });
    return created;
  });
  return Response.json({ data: task }, { status: 201 });
}
