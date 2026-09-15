import "server-only";
import { db } from "@/lib/db";
import { syntheticTestPolicy } from "./ai-test-policy";
export function aiReadiness(userId?: string) {
  const key = Boolean(process.env.OPENAI_API_KEY?.trim()), approved = process.env.OPENAI_COST_APPROVED === "true";
  const supported = (process.env.AI_PROVIDER ?? "openai") === "openai";
  const limit = Number(process.env.OPENAI_DAILY_REQUEST_LIMIT ?? 20);
  const requestLimitValid = Number.isSafeInteger(limit) && limit > 0;
  const test = syntheticTestPolicy(userId);
  const enabled = key && approved && supported && requestLimitValid && test.allowed;
  const voiceModel = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "";
  // A Responses-only key must never advertise paid audio transcription as active.
  const voiceEnabled = enabled && !test.configured && process.env.OPENAI_VOICE_ENABLED === "true" && Boolean(voiceModel);
  return { enabled, voiceEnabled, keyConfigured: key, costApproved: approved, requestLimitValid, model: process.env.OPENAI_MODEL || "gpt-5-mini", voiceModel };
}
// Persistent reservation before sending, including failures. This caps requests,
// not dollars: the owner's provider-side budget must also be configured.
export async function reserveAiRequest(userId: string, kind: "text" | "voice") {
  const readiness = aiReadiness(userId);
  if (!readiness.enabled || (kind === "voice" && !readiness.voiceEnabled)) return false;
  const day = new Date().toISOString().slice(0, 10), id = `${userId}:${day}:${kind}`;
  const configured = Number(process.env.OPENAI_DAILY_REQUEST_LIMIT ?? 20);
  if (!Number.isSafeInteger(configured) || configured <= 0) return false;
  const limit = Math.min(100, configured);
  try { return await db.$transaction(async tx => {
    const total = await tx.aiUsage.aggregate({ where: { day }, _sum: { requests: true } });
    if ((total._sum.requests ?? 0) >= limit) return false;
    await tx.aiUsage.upsert({ where: { id }, create: { id, userId, day, kind, requests: 1 }, update: { requests: { increment: 1 } } });
    return true;
  }); } catch {
    // No reservation means no external request, including database contention.
    // Never retry a possibly committed reservation or expose database details.
    return false;
  }
}
