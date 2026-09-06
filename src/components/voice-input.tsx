"use client";
import { useEffect, useRef, useState } from "react";
import { createVoiceCapture, type CaptureState } from "@/lib/voice-capture";
import { encodeVoiceWav } from "@/lib/voice-audio";

export function VoiceInput({ enabled, disabled, onText }: { enabled: boolean; disabled: boolean; onText: (text: string) => void }) {
  const [state, setState] = useState<CaptureState|"sending">("idle");
  const [status, setStatus] = useState(""); const [consent, setConsent] = useState(false);
  const audio=useRef<Blob|null>(null), request=useRef<AbortController|null>(null), cancelled=useRef(false), mounted=useRef(true);
  const [preview,setPreview]=useState("");
  const previewUrl=useRef("");
  const capture=useRef<ReturnType<typeof createVoiceCapture>|null>(null);
  useEffect(()=>{
    mounted.current=true;
    const recorder=createVoiceCapture((next,message)=>{if(mounted.current){setState(next);setStatus(message);}},clip=>{audio.current=clip;if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);previewUrl.current=clip?URL.createObjectURL(clip):"";if(mounted.current)setPreview(previewUrl.current);});
    capture.current=recorder;
    const hide=()=>{if(document.hidden){cancelled.current=true;request.current?.abort();recorder.cancel("ضبط با خروج از صفحه متوقف شد.");}};
    document.addEventListener("visibilitychange",hide);
    return()=>{mounted.current=false;cancelled.current=true;request.current?.abort();recorder.dispose();capture.current=null;document.removeEventListener("visibilitychange",hide);};
  },[]);
  function cancel(){cancelled.current=true;request.current?.abort();capture.current?.cancel();setConsent(false);}
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
      if(!cancelled.current && mounted.current){capture.current?.cancel("");onText(body.data.text);setStatus("متن آماده و قابل‌ویرایش است؛ هنوز هیچ کاری ثبت نشده.");setState("idle");audio.current=null;setConsent(false);}
    }catch(error){if(!cancelled.current && mounted.current){setStatus(error instanceof Error && error.message!=="duration"?error.message:"صدا قابل پردازش نیست؛ دوباره ضبط کن.");setState("ready");}}
  }
  return <section className="voice-input" aria-label="دستور صوتی">
    {state==="ready" && <><audio controls src={preview || undefined} aria-label="پخش صدای ضبط‌شده" />{!enabled && <p>ضبط انجام شد؛ تبدیل به متن هنوز فعال نیست.</p>}</>}
    <div className="agent-actions">{state==="idle" && <button type="button" disabled={disabled} onClick={()=>{cancelled.current=false;setConsent(false);void capture.current?.start();}}>شروع ضبط</button>}{state==="recording" && <button type="button" onClick={()=>capture.current?.stop()}>توقف ضبط</button>}{state!=="idle" && <button type="button" onClick={cancel}>لغو صدا</button>}{state==="ready" && <button type="button" onClick={()=>void transcribe()} disabled={!consent || !enabled}>تبدیل صدا به متن</button>}</div>
    {state==="ready" && enabled && <label className="agent-toggle"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />با ارسال همین صدا به OpenAI برای تبدیل به متن موافقم.</label>}
    <p role="status" aria-live="polite">{state==="recording"?"در حال ضبط؛ با خروج از صفحه ضبط متوقف می‌شود.":state==="sending"?"در حال تبدیل؛ هنوز عملیاتی اجرا نشده است.":status}</p>
  </section>;
}
