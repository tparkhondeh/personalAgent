import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const { id } = await params;
  const existing = await db.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return jsonError("جلسه پیدا نشد", 404);
  await db.$transaction(async (tx) => {
    await tx.auditLog.create({ data: { userId: session.user.id, action: "MEETING_DELETED", entityType: "Meeting", entityId: id, input: JSON.stringify({ title: existing.title }) } });
    await tx.meeting.delete({ where: { id } });
  });
  return new Response(null, { status: 204 });
}
