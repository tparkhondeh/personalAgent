import { jsonError, requireApiSession } from "@/lib/api";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { aiReadiness, reserveAiRequest } from "@/lib/ai-budget";
import { MAX_VOICE_BYTES, validateVoiceWav, voiceHasSignal } from "@/lib/voice-audio";
import { validAgentOrigin } from "@/lib/agent-origin";
export async function POST(request: Request) {
  if(!validAgentOrigin(request))return jsonError("مبدأ درخواست مجاز نیست",403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید",401);
  const limited = guardUserRateLimit(session.user.id,"voice",{limit:5,windowMs:60000});
  if(limited) return limited;
  if(request.headers.get("x-audio-consent") !== "openai" || request.headers.get("content-type") !== "audio/wav") return jsonError("رضایت ارسال صدا و فایل WAV لازم است",422);
  if(!aiReadiness().enabled) return jsonError("تبدیل صدا هنوز فعال نیست؛ کلید و تأیید هزینه سرویس لازم است. می‌توانی تایپ کنی.",503);
  if(Number(request.headers.get("content-length")) > MAX_VOICE_BYTES) return jsonError("صدا باید کوتاه‌تر از یک دقیقه باشد",413);
  const reader = request.body?.getReader();
  if(!reader) return jsonError("فایل صدا دریافت نشد",422);
  const chunks: Uint8Array[] = []; let size = 0;
  const uploadSignal=AbortSignal.any([request.signal,AbortSignal.timeout(15000)]);
  const cancelUpload=()=>{void reader.cancel().catch(()=>{});};
  uploadSignal.addEventListener("abort",cancelUpload,{once:true});
  try {
    while(true) { const {value,done}=await reader.read(); if(done)break; size+=value.length; if(size>MAX_VOICE_BYTES) {await reader.cancel(); return jsonError("فایل صدا بزرگ است",413);} chunks.push(value); }
    if(uploadSignal.aborted)return jsonError("دریافت صدا متوقف شد؛ دوباره تلاش کن",408);
    const audio = new Uint8Array(size); let offset=0; for(const chunk of chunks){audio.set(chunk,offset);offset+=chunk.length;}
    if(!validateVoiceWav(audio)) return jsonError("فایل صدا معتبر نیست؛ دوباره ضبط کن",422);
    if(!voiceHasSignal(audio))return jsonError("صدای واضحی شنیده نشد؛ دوباره ضبط کن",422);
    if(!await reserveAiRequest(session.user.id,"voice")) return jsonError("سقف روزانه استفاده رسیده است؛ فعلاً تایپ کن",429);
    const form=new FormData(); form.set("file",new Blob([audio],{type:"audio/wav"}),"voice.wav"); form.set("model",aiReadiness().voiceModel); form.set("language","fa");
    const response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:form,signal:AbortSignal.any([request.signal,AbortSignal.timeout(30000)]),cache:"no-store"});
    if(!response.ok) return jsonError(response.status===429?"سرویس موقتاً محدود شده؛ دوباره تلاش کن":"تبدیل صدا انجام نشد؛ تایپ همچنان در دسترس است",response.status===429?429:502);
    const result=await response.json();
    if(typeof result.text!=="string" || !result.text.trim()) return jsonError("صدای قابل‌تشخیص دریافت نشد؛ دوباره ضبط کن",422);
    return Response.json({data:{text:result.text.trim().slice(0,2000),mode:"online",provider:"OpenAI"}},{headers:{"Cache-Control":"no-store"}});
  } catch { return jsonError("ارتباط تبدیل صدا قطع شد؛ دوباره تلاش کن",503); }
  finally { uploadSignal.removeEventListener("abort",cancelUpload); chunks.length=0; reader.releaseLock(); }
}
