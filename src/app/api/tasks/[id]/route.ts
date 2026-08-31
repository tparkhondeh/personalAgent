import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const { id } = await params;
  const existing = await db.task.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return jsonError("کار پیدا نشد", 404);
  const parsed = taskUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات کار معتبر نیست", 422, parsed.error.flatten());
  const { reminderMinutes, ...updates } = parsed.data;
  void reminderMinutes;
  const data = { ...updates, startAt: updates.startAt ? new Date(updates.startAt) : undefined, dueAt: updates.dueAt ? new Date(updates.dueAt) : undefined, completedAt: updates.status === "DONE" ? new Date() : updates.status ? null : undefined };
  const task = await db.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id }, data });
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_UPDATED", entityType: "Task", entityId: id, input: JSON.stringify(parsed.data) } });
    return updated;
  });
  return Response.json({ data: task });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const { id } = await params;
  const existing = await db.task.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return jsonError("کار پیدا نشد", 404);
  await db.$transaction(async (tx) => {
    await tx.auditLog.create({ data: { userId: session.user.id, action: "TASK_DELETED", entityType: "Task", entityId: id, input: JSON.stringify({ title: existing.title }) } });
    await tx.task.delete({ where: { id } });
  });
  return new Response(null, { status: 204 });
}
