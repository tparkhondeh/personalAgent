import { jsonError, requireApiSession } from "@/lib/api";
import { validAgentOrigin } from "@/lib/agent-origin";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { selfHostedSpeechConfig } from "@/lib/self-hosted-speech";
import { MAX_VOICE_BYTES, validateVoiceWav, voiceHasSignal } from "@/lib/voice-audio";

export async function GET(request: Request) {
  if (!await requireApiSession(request.headers)) return jsonError("ابتدا وارد حساب شوید", 401);
  const config = selfHostedSpeechConfig();
  let enabled = false;
  if (config.enabled) {
    try {
      const result = await fetch(`${config.url}/health`, { headers: { Authorization: `Bearer ${config.token}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(2000) });
      enabled = result.ok && (await result.json()).ready === true;
    } catch { /* Offline remains usable. */ }
  }
  return Response.json({ data: { enabled, provider: "tia", maxSeconds: 60 } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  if (request.headers.get("x-audio-consent") !== "tia-server" || request.headers.get("content-type") !== "audio/wav") return jsonError("رضایت ارسال همین صدا به سرور tia لازم است", 422);
  const limited = guardUserRateLimit(session.user.id, "private-voice", { limit: 5, windowMs: 60000 });
  if (limited) return limited;
  const config = selfHostedSpeechConfig();
  if (!config.enabled) return jsonError("تشخیص سرور آماده نیست؛ روش روی دستگاه در دسترس است", 503);
  if (Number(request.headers.get("content-length")) > MAX_VOICE_BYTES) return jsonError("صدا باید حداکثر یک دقیقه باشد", 413);
  const reader = request.body?.getReader();
  if (!reader) return jsonError("صدا دریافت نشد", 422);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  try {
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_VOICE_BYTES) { await reader.cancel(); return jsonError("فایل صدا بزرگ است", 413); }
      chunks.push(value);
    }
    if (signal.aborted) return jsonError("دریافت صدا لغو شد", 408);
    const audio = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
    if (!validateVoiceWav(audio) || !voiceHasSignal(audio)) return jsonError("گفتار واضحی دریافت نشد؛ دوباره ضبط کن", 422);
    const response = await fetch(`${config.url}/transcribe`, {
      method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "audio/wav" },
      body: audio, redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
    });
    if (!response.ok) return jsonError(response.status === 429 ? "تشخیص سرور مشغول است؛ دوباره تلاش کن" : "تشخیص سرور کامل نشد؛ روش روی دستگاه را امتحان کن", response.status === 429 ? 429 : 502);
    const result = await response.json();
    if (typeof result.text !== "string" || !result.text.trim()) return jsonError("گفتار واضحی تشخیص داده نشد", 422);
    return Response.json({ data: { text: result.text.trim().slice(0, 2000), provider: "tia", mode: "self-hosted" } }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("ارتباط با سرور قطع شد؛ روش روی دستگاه همچنان در دسترس است", 503); }
  finally { signal.removeEventListener("abort", cancel); chunks.length = 0; reader.releaseLock(); }
}
