import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { DraftError, executeDraft, saveDraft } from "@/lib/agent-drafts";
import { planSchema } from "@/lib/agent-plan-schema";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { validAgentOrigin } from "@/lib/agent-origin";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), revision: z.number().int().positive(), confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("edit"), revision: z.number().int().positive(), plan: planSchema }).strict(),
  z.object({ action: z.literal("cancel"), revision: z.number().int().positive() }).strict(),
]);
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if(!validAgentOrigin(request))return jsonError("مبدأ درخواست مجاز نیست",403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "agent-confirm", { limit: 30, windowMs: 60000 });
  if (limited) return limited;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات تأیید معتبر نیست", 422);
  const { id } = await params, userId = session.user.id, data = parsed.data;
  try {
    if (data.action === "confirm") return Response.json({ data: await executeDraft(userId, id, data.revision) });
    const draft = await db.agentDraft.findFirst({ where: { id, userId, revision: data.revision, status: "PENDING" } });
    if (!draft) return jsonError("پیشنهاد جاری پیدا نشد", 409);
    if (data.action === "edit") return Response.json({ data: await saveDraft(userId, draft.conversationId, data.plan, { id, revision: data.revision }) });
    const cancelled = await db.agentDraft.updateMany({ where: { id, userId, revision: data.revision, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (!cancelled.count) return jsonError("وضعیت پیشنهاد تغییر کرده است", 409);
    return Response.json({ data: { cancelled: true } });
  } catch (error) {
    if (error instanceof DraftError) return jsonError(error.message, error.status);
    return jsonError("عملیات انجام نشد؛ بدون ساخت مورد تکراری دوباره تلاش کن.", 503);
  }
}
