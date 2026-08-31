import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { notificationReadSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const notifications = await db.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return Response.json({ data: notifications });
}

export async function PATCH(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const parsed = notificationReadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("درخواست اعلان معتبر نیست", 422, parsed.error.flatten());
  const where = parsed.data.all ? { userId: session.user.id, readAt: null } : { id: parsed.data.id, userId: session.user.id };
  const updated = await db.notification.updateMany({ where, data: { readAt: new Date() } });
  if (!parsed.data.all && updated.count === 0) return jsonError("اعلان پیدا نشد", 404);
  return Response.json({ data: { updated: updated.count } });
}
