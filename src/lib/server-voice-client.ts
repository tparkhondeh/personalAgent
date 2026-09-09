import { encodeVoiceWav } from "@/lib/voice-audio";
// Only called after a fresh, explicit user selection. No external-provider fallback.
export async function transcribeOnTia(clip: Blob, signal: AbortSignal, progress: (text: string) => void) {
  const check = () => { if (signal.aborted) throw new Error("تبدیل لغو شد؛ چیزی ثبت نشده است."); };
  check();
  if (!clip.size || clip.size > 4 * 1024 * 1024) throw new Error("فایل صدا معتبر نیست.");
  const context = new AudioContext(); let decoded: AudioBuffer;
  try { decoded = await context.decodeAudioData(await clip.arrayBuffer()); } finally { await context.close(); }
  check();
  if (decoded.duration < 0.1 || decoded.duration > 60) throw new Error("صدا باید حداکثر یک دقیقه باشد.");
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
  const wav = encodeVoiceWav((await offline.startRendering()).getChannelData(0)); check();
  progress("در حال تبدیل روی سرور خود tia؛ صدا ذخیره نمی‌شود…");
  const response = await fetch("/api/agent/local-transcribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "audio/wav", "x-audio-consent": "tia-server" }, body: wav, signal, cache: "no-store" });
  const result = await response.json(); check();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "تبدیل سرور انجام نشد؛ روش روی دستگاه را امتحان کن.");
  if (typeof result.data?.text !== "string" || !result.data.text.trim()) throw new Error("گفتار واضحی تشخیص داده نشد.");
  return result.data.text as string;
}
