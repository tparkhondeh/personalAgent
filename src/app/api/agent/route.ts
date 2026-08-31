import { generateText, Output } from "ai";
import { z } from "zod";
import { getLanguageModel, agentSystemPrompt } from "@/lib/agent";
import { jsonError, requireApiSession } from "@/lib/api";

const requestSchema = z.object({ message: z.string().trim().min(1).max(4000), timezone: z.string().max(100).default("Asia/Tehran") });
const responseSchema = z.object({
  reply: z.string().describe("پاسخ کوتاه و دوستانه فارسی"),
  proposal: z.object({
    kind: z.enum(["CREATE_TASK", "CREATE_MEETING", "PLAN", "NONE"]),
    needsApproval: z.boolean(),
    title: z.string().optional(),
    category: z.enum(["PERSONAL", "WORK"]).optional(),
    priority: z.enum(["URGENT", "IMPORTANT", "NORMAL"]).optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    dueAt: z.string().optional(),
    reasoning: z.string().optional(),
  }),
});

export async function POST(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  if (!process.env.OPENAI_API_KEY) return jsonError("کلید ارائه‌دهنده هوش مصنوعی هنوز تنظیم نشده است", 503);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("پیام معتبر نیست", 422, parsed.error.flatten());
  const result = await generateText({
    model: getLanguageModel(),
    system: `${agentSystemPrompt}\nمنطقه زمانی کاربر: ${parsed.data.timezone}\nزمان فعلی UTC: ${new Date().toISOString()}`,
    prompt: parsed.data.message,
    output: Output.object({ schema: responseSchema }),
  });
  return Response.json({ data: result.output });
}
