import { jsonError, requireApiSession } from "@/lib/api";
import { db } from "@/lib/db";
import { getVoiceCallReadiness } from "@/lib/outbound-calls";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { emergencyPhone: true } });
  const call = getVoiceCallReadiness(preference?.emergencyPhone);
  return Response.json({
    data: {
      llm: {
        mode: process.env.OPENAI_API_KEY?.trim() ? "configured" : "local",
        provider: process.env.AI_PROVIDER || "openai",
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
      },
      call,
    },
  });
}
