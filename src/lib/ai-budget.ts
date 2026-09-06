import "server-only";
import { db } from "@/lib/db";
export function aiReadiness() {
  const key = Boolean(process.env.OPENAI_API_KEY?.trim()), approved = process.env.OPENAI_COST_APPROVED === "true";
  return { enabled: key && approved, keyConfigured: key, costApproved: approved, model: process.env.OPENAI_MODEL || "gpt-5-mini", voiceModel: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe" };
}
// Persistent reservation before sending, including failures. This caps requests,
// not dollars: the owner's provider-side budget must also be configured.
export async function reserveAiRequest(userId: string, kind: "text" | "voice") {
  if (!aiReadiness().enabled) return false;
  const day = new Date().toISOString().slice(0, 10), id = `${userId}:${day}:${kind}`;
  const configured = Number(process.env.OPENAI_DAILY_REQUEST_LIMIT || 20);
  const limit = Number.isInteger(configured) ? Math.max(1, Math.min(100, configured)) : 20;
  return db.$transaction(async tx => {
    const total = await tx.aiUsage.aggregate({ where: { day }, _sum: { requests: true } });
    if ((total._sum.requests ?? 0) >= limit) return false;
    await tx.aiUsage.upsert({ where: { id }, create: { id, userId, day, kind, requests: 1 }, update: { requests: { increment: 1 } } });
    return true;
  });
}
