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
  return Response.json({ ...publicWebPushConfig(), userId: session.user.id }, { headers: { "Cache-Control": "no-store" } });
}

const subscriptionSchema = z.object({ userId: z.string().min(1).max(256), endpoint: z.url().max(4096), keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }) });

export async function POST(request: Request) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات اعلان معتبر نیست", 422);
  if (parsed.data.userId !== session.user.id) return jsonError("حساب تغییر کرده است؛ صفحه را تازه کنید", 409);
  if (!isSupportedPushEndpoint(parsed.data.endpoint)) return jsonError("سرویس Push این مرورگر پشتیبانی نمی‌شود؛ از یادآوری داخل برنامه استفاده کنید", 422);
  try {
    const where = { endpoint: parsed.data.endpoint, userId: session.user.id };
    const data = { p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth };
    // Do not use upsert's extended WHERE as an ownership boundary: the native
    // SQLite conflict-update path may only target the unique endpoint. Every
    // update below is explicitly owner-scoped; create cannot replace a row.
    const updated = await db.pushSubscription.updateMany({ where, data });
    if (updated.count === 0) {
      try { await db.pushSubscription.create({ data: { ...where, ...data } }); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
        // A concurrent registration of THIS owner may be retried once. Another
        // owner's endpoint remains untouched and must be rejected.
        const retried = await db.pushSubscription.updateMany({ where, data });
        if (retried.count === 0) return jsonError("اشتراک قبلی باید روی همین دستگاه لغو شود", 409);
      }
    }
  } catch {
    return jsonError("ثبت اعلان انجام نشد", 503);
  }
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات اعلان معتبر نیست", 422);
  if (parsed.data.userId !== session.user.id) return jsonError("حساب تغییر کرده است؛ صفحه را تازه کنید", 409);
  try {
    // Idempotent, exact device proof, scoped to the current owner; no other devices.
    const removed = await db.pushSubscription.deleteMany({ where: { userId: session.user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth } });
    return Response.json({ ok: true, revoked: removed.count > 0 });
  } catch {
    return jsonError("لغو اعلان انجام نشد؛ خروج را دوباره بررسی کنید", 503);
  }
}
