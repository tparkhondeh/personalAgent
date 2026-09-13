import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { validAgentOrigin } from "@/lib/agent-origin";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { publicWebPushConfig } from "@/lib/push-config";
import { isSupportedPushEndpoint } from "@/lib/push-endpoint";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  return Response.json(publicWebPushConfig(), { headers: { "Cache-Control": "no-store" } });
}

const subscriptionSchema = z.object({ endpoint: z.url().max(4096), keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }) });

export async function POST(request: Request) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات اعلان معتبر نیست", 422);
  if (!isSupportedPushEndpoint(parsed.data.endpoint)) return jsonError("سرویس Push این مرورگر پشتیبانی نمی‌شود؛ از یادآوری داخل برنامه استفاده کنید", 422);
  await db.pushSubscription.upsert({ where: { endpoint: parsed.data.endpoint }, update: { userId: session.user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth }, create: { userId: session.user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth } });
  return Response.json({ ok: true }, { status: 201 });
}
