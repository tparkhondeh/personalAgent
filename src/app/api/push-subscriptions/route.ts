import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { guardUserRateLimit } from "@/lib/rate-limit";

const subscriptionSchema = z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) });

export async function POST(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات اعلان معتبر نیست", 422);
  await db.pushSubscription.upsert({ where: { endpoint: parsed.data.endpoint }, update: { userId: session.user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth }, create: { userId: session.user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth } });
  return Response.json({ ok: true }, { status: 201 });
}
