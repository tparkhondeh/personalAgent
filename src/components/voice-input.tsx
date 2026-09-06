"use client";
import { useEffect, useRef, useState } from "react";
import { createVoiceCapture, type CaptureState } from "@/lib/voice-capture";
import { createLocalSpeech } from "@/lib/local-speech";

export function VoiceInput({ disabled, onText, onBusyChange }: { disabled: boolean; onText: (text: string) => void; onBusyChange: (busy:boolean)=>void }) {
  const [state,setState]=useState<CaptureState|"sending">("idle"),[status,setStatus]=useState(""),[preview,setPreview]=useState("");
  const callback=useRef(onText),start=useRef<()=>void>(()=>{}),stop=useRef<()=>void>(()=>{}),cancel=useRef<()=>void>(()=>{}),retry=useRef<()=>void>(()=>{});
  useEffect(()=>{callback.current=onText;},[onText]);
  useEffect(()=>{onBusyChange(state==="asking"||state==="recording"||state==="sending");},[state,onBusyChange]);
  useEffect(()=>{
    let alive=true,version=0,audio:Blob|null=null,url="",busy=false;
    const speech=createLocalSpeech();
    async function convert(){
      if(!audio||busy)return;const current=++version;busy=true;setState("sending");
      try {
        const text=await speech.transcribe(audio,message=>{if(alive&&current===version)setStatus(message);});
        if(alive&&current===version){recorder.cancel("");callback.current(text);setStatus("متن قابل‌ویرایش است؛ ثبت فقط با تأیید شما انجام می‌شود.");}
      }catch(error){if(alive&&current===version){recorder.cancel("");setState("ready");setStatus(error instanceof Error?error.message:"تبدیل صدا کامل نشد؛ دوباره تلاش کن.");}}
      finally{if(current===version)busy=false;}
    }
    const recorder=createVoiceCapture((next,message)=>{
      if(!alive)return;setState(next);setStatus(message);if(next==="ready")void convert();
    },clip=>{audio=clip;if(url)URL.revokeObjectURL(url);url=clip?URL.createObjectURL(clip):"";if(alive)setPreview(url);});
    start.current=()=>{if(!busy)void recorder.start();};stop.current=()=>recorder.stop();retry.current=()=>{if(audio)void convert();else void recorder.start();};
    cancel.current=()=>{version++;speech.cancel();busy=false;recorder.cancel();};
    const hide=()=>{if(document.hidden)cancel.current();},leave=()=>cancel.current();document.addEventListener("visibilitychange",hide);document.addEventListener("tia-cancel-voice",leave);
    return()=>{alive=false;version++;speech.cancel();recorder.dispose();if(url)URL.revokeObjectURL(url);document.removeEventListener("visibilitychange",hide);document.removeEventListener("tia-cancel-voice",leave);};
  },[]);
  return <section className="voice-input" aria-label="دستور صوتی">
    {preview && <audio controls src={preview} aria-label="پخش صدای ضبط‌شده" />}
    <div className="agent-actions">
      {state==="idle"&&<button type="button" disabled={disabled} onClick={()=>start.current()}>شروع ضبط</button>}
      {state==="recording"&&<button type="button" onClick={()=>stop.current()}>توقف ضبط</button>}
      {state!=="idle"&&<button type="button" onClick={()=>cancel.current()}>لغو صدا</button>}
      {state==="ready"&&<button type="button" disabled={disabled} onClick={()=>retry.current()}>تلاش دوباره</button>}
    </div>
    <p role="status" aria-live="polite">{status||"تبدیل فارسی روی دستگاه؛ بدون ارسال صدا."}</p>
  </section>;
}
