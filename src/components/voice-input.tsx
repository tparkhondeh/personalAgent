"use client";
import { useEffect, useRef, useState } from "react";
import { encodeVoiceWav } from "@/lib/voice-audio";

export function VoiceInput({ enabled, disabled, onText }: { enabled: boolean; disabled: boolean; onText: (text: string) => void }) {
  const [state, setState] = useState<"idle"|"recording"|"ready"|"sending">("idle");
  const [status, setStatus] = useState(""); const [consent, setConsent] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), audio = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), cancelled = useRef(false), request = useRef<AbortController | null>(null), mounted = useRef(true);
  function cancel() {
    cancelled.current = true; request.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop());
    if(timer.current) clearTimeout(timer.current);
    audio.current = null; setState("idle"); setStatus("ضبط لغو شد؛ صوتی نگه‌داری نمی‌شود.");
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => { if(document.hidden) { cancelled.current = true; request.current?.abort(); if(recorder.current?.state === "recording")recorder.current.stop(); stream.current?.getTracks().forEach(t=>t.stop()); audio.current=null; setState("idle"); setStatus("ضبط با خروج از صفحه متوقف شد."); } };
    document.addEventListener("visibilitychange",hide);
    return () => { mounted.current=false; cancelled.current=true; request.current?.abort(); if(timer.current)clearTimeout(timer.current); if(recorder.current?.state==="recording")recorder.current.stop(); stream.current?.getTracks().forEach(t=>t.stop()); audio.current=null; document.removeEventListener("visibilitychange",hide); };
  },[]);
  async function start() {
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setStatus("ضبط صدا در این مرورگر در دسترس نیست؛ می‌توانی تایپ کنی."); return; }
    cancelled.current=false; setStatus(""); audio.current=null;
    try {
      const input = await navigator.mediaDevices.getUserMedia({audio:true});
      if(cancelled.current || !mounted.current) {input.getTracks().forEach(t=>t.stop());return;}
      stream.current=input; const record=new MediaRecorder(input); recorder.current=record;
      const chunks:Blob[]=[];
      record.ondataavailable=e=>{if(e.data.size && !cancelled.current)chunks.push(e.data);};
      record.onstop=()=>{input.getTracks().forEach(t=>t.stop());if(timer.current)clearTimeout(timer.current);if(cancelled.current || !mounted.current){chunks.length=0;return;} audio.current=new Blob(chunks,{type:record.mimeType});chunks.length=0;setState("ready");setStatus("ضبط تمام شد. فقط با زدن تبدیل، صدا به OpenAI ارسال می‌شود.");};
      record.onerror=()=>{cancelled.current=true;input.getTracks().forEach(t=>t.stop());audio.current=null;setState("idle");setStatus("ضبط انجام نشد؛ دوباره تلاش کن.");};
      record.start();setState("recording");timer.current=setTimeout(()=>{if(record.state==="recording")record.stop();},60000);
    } catch {setState("idle");setStatus("اجازه میکروفون داده نشد یا میکروفون در دسترس نیست؛ تایپ کن یا دوباره تلاش کن.");}
  }
  async function transcribe() {
    if(!audio.current || !consent || !enabled)return;
    if(!navigator.onLine){setStatus("اینترنت قطع است؛ صدا هنوز ارسال نشده است.");return;}
    setState("sending"); const controller=new AbortController();request.current=controller;
    try {
      const context=new AudioContext();let decoded:AudioBuffer;
      try {decoded=await context.decodeAudioData(await audio.current.arrayBuffer());}finally{await context.close();}
      if(decoded.duration<0.1 || decoded.duration>61)throw new Error("duration");
      const offline=new OfflineAudioContext(1,Math.min(960000,Math.ceil(decoded.duration*16000)),16000);
      const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
      const rendered=await offline.startRendering(), wav=encodeVoiceWav(rendered.getChannelData(0));
      if(cancelled.current || controller.signal.aborted)return;
      const response=await fetch("/api/agent/transcribe",{method:"POST",headers:{"content-type":"audio/wav","x-audio-consent":"openai"},body:new Blob([wav as BlobPart],{type:"audio/wav"}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(35000)])});
      const body=await response.json();if(!response.ok)throw new Error(body.error || "تبدیل صدا انجام نشد.");
      if(!cancelled.current && mounted.current){onText(body.data.text);setStatus("متن آماده و قابل‌ویرایش است؛ هنوز هیچ کاری ثبت نشده.");setState("idle");audio.current=null;setConsent(false);}
    }catch(error){if(!cancelled.current && mounted.current){setStatus(error instanceof Error && error.message!=="duration"?error.message:"صدا قابل پردازش نیست؛ دوباره ضبط کن.");setState("ready");}}
  }
  return <section className="voice-input" aria-label="دستور صوتی">
    <p>{enabled?"تبدیل صدا: OpenAI، حداکثر یک دقیقه. صدا در برنامه آرشیو نمی‌شود؛ پردازش سرویس تابع سیاست آن است.":"تبدیل صدا نیازمند فعال‌سازی سرویس است؛ ضبط آزمایشی و تایپ در دسترس‌اند."}</p>
    <div className="agent-actions">{state==="idle" && <button type="button" disabled={disabled} onClick={()=>void start()}>شروع ضبط</button>}{state==="recording" && <button type="button" onClick={()=>recorder.current?.stop()}>توقف ضبط</button>}{state!=="idle" && <button type="button" onClick={cancel}>لغو صدا</button>}{state==="ready" && <button type="button" onClick={()=>void transcribe()} disabled={!consent || !enabled}>تبدیل صدا به متن</button>}</div>
    {state==="ready" && <label className="agent-toggle"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />با ارسال همین صدا به OpenAI برای تبدیل به متن موافقم.</label>}
    <p role="status" aria-live="polite">{state==="recording"?"در حال ضبط؛ با خروج از صفحه ضبط متوقف می‌شود.":state==="sending"?"در حال تبدیل؛ هنوز عملیاتی اجرا نشده است.":status}</p>
  </section>;
}
