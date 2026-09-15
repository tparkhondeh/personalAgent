import { jsonError, requireApiSession } from "@/lib/api";
import { db } from "@/lib/db";
import { getVoiceCallReadiness } from "@/lib/outbound-calls";
import { aiReadiness } from "@/lib/ai-budget";
import { monthlyBudgetStatus } from "@/lib/ai-monthly-budget";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { emergencyPhone: true } });
  const call = getVoiceCallReadiness(preference?.emergencyPhone);
  const readiness = aiReadiness(session.user.id);
  const budget = await monthlyBudgetStatus(session.user.id);
  return Response.json({
    data: {
      llm: {
        mode: readiness.enabled && budget?.available !== false ? "configured" : "local",
        budget,
        provider: process.env.AI_PROVIDER || "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
      },
      call,
      voice: { enabled: readiness.voiceEnabled, provider: "OpenAI", maxSeconds: 60, costApproved: readiness.costApproved },
    },
  });
}
