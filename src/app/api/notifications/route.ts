import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const notifications = await db.notification.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return Response.json({ data: notifications });
}
