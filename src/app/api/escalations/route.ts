import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { listNativeEscalationAlarms, syncUserEscalations } from "@/lib/escalation-service";
import { escalationAcknowledgeSchema } from "@/lib/validation";
import { guardUserRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  return Response.json({ data: { alarms: await listNativeEscalationAlarms(session.user.id) } });
}

export async function POST(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "escalations", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  return Response.json({ data: await syncUserEscalations(session.user.id) });
}

export async function PATCH(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "escalations", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = escalationAcknowledgeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("فهرست هشدارها معتبر نیست", 422, parsed.error.flatten());
  const updated = await db.escalationAttempt.updateMany({
    where: { id: { in: parsed.data.attemptIds }, userId: session.user.id, status: "READY_FOR_DEVICE" },
    data: { status: "SCHEDULED" },
  });
  await db.auditLog.create({ data: { userId: session.user.id, action: "ANDROID_ALARMS_SCHEDULED", entityType: "EscalationAttempt", source: "DEVICE", result: JSON.stringify({ count: updated.count }) } });
  return Response.json({ data: { updated: updated.count } });
}
