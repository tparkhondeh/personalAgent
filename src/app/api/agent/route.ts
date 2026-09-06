import { generateText, Output } from "ai";
import { z } from "zod";
import { getLanguageModel, agentSystemPrompt } from "@/lib/agent";
import { jsonError, requireApiSession } from "@/lib/api";
import { db } from "@/lib/db";
import { planPersian, type Plan } from "@/lib/agent-planner";
import { planSchema, modelPlanSchema } from "@/lib/agent-plan-schema";
import { DraftError, ownedPlanningItems, saveDraft } from "@/lib/agent-drafts";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { parseStoredReminderOffsets } from "@/lib/reminder-offsets";
import { aiReadiness, reserveAiRequest } from "@/lib/ai-budget";
import { validAgentOrigin } from "@/lib/agent-origin";

const input = z.object({ message: z.string().trim().min(1).max(2000), conversationId: z.string().max(150).optional(), draftId: z.string().max(150).optional(), revision: z.number().int().positive().optional(), externalConsent: z.boolean().default(false), localOnly: z.boolean().default(false) });
const outputSchema = z.object({ reply: z.string().max(1000), plan: modelPlanSchema.nullable(), questions: z.array(z.string().max(200)).max(10) });

export async function POST(request: Request) {
  if(!validAgentOrigin(request))return jsonError("مبدأ درخواست مجاز نیست",403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "agent", { limit: 20, windowMs: 60000 });
  if (limited) return limited;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("پیام معتبر نیست", 422);
  const data = parsed.data, userId = session.user.id;
  const conversation = data.conversationId ? await db.conversation.findFirst({ where: { id: data.conversationId, userId }, include: { messages: { orderBy: { createdAt: "desc" }, take: 4 } } }) : null;
  if (data.conversationId && !conversation) return jsonError("گفتگو پیدا نشد", 404);
  const prior = data.draftId ? await db.agentDraft.findFirst({ where: { id: data.draftId, userId, conversationId: conversation?.id ?? "", revision: data.revision ?? -1, status: "PENDING", expiresAt: { gt: new Date() } } }) : null;
  if (data.draftId && !prior) return jsonError("پیشنهاد جاری تغییر کرده؛ دوباره بررسی کن.", 409);
  const [preference, items] = await Promise.all([db.userPreference.findUnique({ where: { userId } }), ownedPlanningItems(userId)]);
  const timezone = preference?.timezone ?? "Asia/Tehran";
  const local = planPersian(data.message, { timezone, previous: prior ? planSchema.parse(JSON.parse(prior.payload)) : null, items, offsets: parseStoredReminderOffsets(preference?.defaultReminderOffsets, preference?.defaultReminderMins) });
  let reply = local.reply, plan: Plan | null = local.plan, questions = local.questions;
  let mode = "local";
  if (data.externalConsent && !data.localOnly && aiReadiness().enabled) {
    if (await reserveAiRequest(userId, "text")) {
      try {
        const result = await generateText({
          model: getLanguageModel(), system: agentSystemPrompt + "\nهیچ ابزار اجرایی نداری. زمان نامشخص را خالی بگذار و سؤال بپرس. مدت جلسه نامشخص را null بگذار، درباره آن سؤال نپرس؛ برنامه مقدار پیش‌فرض داخلی را تعیین می‌کند. quietStart و quietEnd همیشه 00:00 باشند؛ ساعات سکوت حذف شده است و درباره آن یا منطقه زمانی سؤال نپرس. عنوان کوتاه و طبیعی فقط شامل موضوع، فرد یا تیم باشد؛ زمان و دستور ثبت یا هشدار وارد عنوان نشوند. تکرار روزانه یا هفتگی فقط با occurrenceCount مشخص از 2 تا 12 نوبت؛ تعداد نامشخص را null بگذار و سؤال بپرس. اصلاح ادامه گفتگو همان پیش‌نویس را تغییر می‌دهد. حداکثر یک عملیات در هر پیشنهاد. برای پیام چندعملیاتی سؤال بپرس. ساعت 24 ساعته و date میلادی YYYY-MM-DD است؛ تاریخ شمسی را دقیق تبدیل کن. حالا: " + new Date().toISOString() + "؛ منطقه زمانی: " + timezone,
          prompt: JSON.stringify({ message: data.message, draft: prior ? JSON.parse(prior.payload) : null, localCandidate: local.plan, preferences: { timezone, offsets: local.plan?.reminderOffsets }, relevantItems: items.filter(i => data.message.includes(i.title) || /خلاصه|برنامه/.test(data.message)).slice(0, 12).map(i => ({ id: i.id, entity: i.entity, title: i.title, startsAt: i.startsAt, dueAt: i.dueAt, endsAt: i.endsAt })), history: conversation?.messages.slice().reverse().map(m => ({ role: m.role, text: m.content.slice(0, 600) })) }),
          output: Output.object({ schema: outputSchema }), maxOutputTokens: 2200, maxRetries: 0, abortSignal: AbortSignal.timeout(25000),
        });
        reply = result.output.reply; plan = result.output.plan; questions = result.output.questions.filter(q=>!/مدت|سکوت|منطقه زمانی/.test(q)); mode = "online";
      } catch { mode = "local-fallback"; }
    } else mode = "local-budget-limit";
  }
  const current = conversation ?? await db.conversation.create({ data: { userId, title: data.message.slice(0, 80) } });
  try {
    const draft = plan ? await saveDraft(userId, current.id, plan, prior ? { id: prior.id, revision: prior.revision } : undefined, mode === "online" ? questions : questions.filter(q => /چند درخواست|تاریخ شمسی/.test(q))) : null;
    await db.message.createMany({ data: [{ conversationId: current.id, role: "USER", content: data.message }, { conversationId: current.id, role: "ASSISTANT", content: reply, toolName: draft ? "PROPOSAL" : "PLAN", toolPayload: draft ? JSON.stringify({ id: draft.id, revision: draft.revision }) : null }] });
    return Response.json({ data: { reply, draft, conversationId: current.id, mode, candidates: local.candidates ?? [], proposal: { kind: plan ? (plan.entity === "TASK" ? "CREATE_TASK" : "CREATE_MEETING") : "PLAN", needsApproval: Boolean(plan), title: plan?.title } } });
  } catch (error) {
    if (error instanceof DraftError) return jsonError(error.message, error.status);
    return jsonError("پیشنهاد قابل ذخیره نبود؛ دوباره تلاش کن.", 503);
  }
}
