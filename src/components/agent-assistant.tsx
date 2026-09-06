"use client";
import Link from "next/link";
import { PersianDateField, Time24Field } from "@/components/persian-date-time";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { approvalSummary, type Plan, type PlanningItem } from "@/lib/agent-planner";
import { VoiceInput } from "@/components/voice-input";
import { syncApprovedDeviceReminders } from "@/lib/approved-device-reminders";
import { readComposeDraft, saveComposeDraft, offerGuestDraft, claimGuestDraft } from "@/lib/assistant-draft";

type Draft = { id: string; revision: number; plan: Plan; preview: { instant: string | null; questions: string[]; warnings: string[]; schedule: { channel: string; scheduledFor: string; offset: number }[] } };
const channels = { IN_APP: "داخل برنامه", PUSH: "Push", NATIVE: "Notification", ALARM: "Alarm گوشی" } as const;
const operations = { CREATE: "ایجاد", UPDATE: "ویرایش", COMPLETE: "تکمیل", DELETE: "حذف و بایگانی" };
export function AgentAssistant({ onAdd, onChanged }: { onAdd: () => void; onChanged: () => Promise<void> }) {
  const {data:session}=authClient.useSession();
  const [attempted,setAttempted]=useState(false);
  const review=useRef<HTMLElement>(null);
  const owner=session?.user.id??"guest";
  const [input,setInputValue]=useState(()=>typeof window==="undefined"?"":readComposeDraft(owner));
  const setInput=(value:string)=>{setInputValue(value);saveComposeDraft(owner,value);};
  const textbox=useRef<HTMLTextAreaElement>(null);
  const [needsAccount,setNeedsAccount]=useState(false);
  useEffect(()=>{const id=session?.user.id;if(!id)return;const timer=setTimeout(()=>{const restored=claimGuestDraft();if(restored){setInputValue(restored);saveComposeDraft(id,restored);}},0);return()=>clearTimeout(timer);},[session?.user.id]);
  useEffect(()=>{const box=textbox.current;if(box){box.style.height="auto";box.style.height=`${Math.min(144,Math.max(44,box.scrollHeight))}px`;}},[input]);
  const [reply,setReply]=useState(""),[status,setStatus]=useState(""),[pending,setPending]=useState(false);
  const [draft,setDraft]=useState<Draft|null>(null),[edit,setEdit]=useState<Plan|null>(null),[conversationId,setConversationId]=useState<string>();
  const [candidates,setCandidates]=useState<PlanningItem[]>([]),[mode,setMode]=useState("local"),[external,setExternal]=useState(false),[online,setOnline]=useState(false),[voiceBusy,setVoiceBusy]=useState(false);
  useEffect(()=>{if(draft)review.current?.scrollIntoView({block:"start"});},[draft]);
  const editing=Boolean(edit);
  useEffect(()=>{const viewport=window.visualViewport;let frame=0;const resize=()=>{
    cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const root=review.current;if(!root)return;
      root.style.setProperty("--review-viewport",`${viewport?.height??window.innerHeight}px`);
      if(editing)root.scrollIntoView({block:"start"});
      const editor=root.querySelector<HTMLElement>(".approval-editor");
      if(editor)root.style.setProperty("--editor-available",`${Math.max(80,(viewport?.height??window.innerHeight)+(viewport?.offsetTop??0)-editor.getBoundingClientRect().top-96)}px`);
    });
  };resize();viewport?.addEventListener("resize",resize);return()=>{cancelAnimationFrame(frame);viewport?.removeEventListener("resize",resize);};},[draft,editing]);
  useEffect(()=>{if(!session)return;let active=true;void fetch("/api/integrations",{cache:"no-store"}).then(r=>r.json()).then(b=>{if(active){setOnline(b.data?.llm?.mode==="configured");}}).catch(()=>{});return()=>{active=false;};},[session]);
  async function send(event:FormEvent) {
    event.preventDefault();if(!voiceBusy)await sendMessage(input,external);
  }
  async function sendMessage(message:string,externalConsent=false) {
    if(!message.trim()||pending)return;if(!session){setNeedsAccount(true);return;}setNeedsAccount(false);setPending(true);setStatus("");setAttempted(false);
    try {
      const response=await fetch("/api/agent",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message,conversationId,draftId:draft?.id,revision:draft?.revision,externalConsent}),signal:AbortSignal.timeout(35000)});
      const body=await response.json();if(!response.ok)throw new Error(body.error);
      setReply(body.data.reply);setDraft(body.data.draft);setConversationId(body.data.conversationId);setCandidates(body.data.candidates);setMode(body.data.mode);setInput("");setEdit(null);
    }catch(error){setStatus(error instanceof Error?error.message:"ارتباط قطع شد؛ دوباره تلاش کن.");}finally{setPending(false);}
  }
  async function act(action:"edit"|"confirm"|"cancel") {
    if(!draft||pending||voiceBusy)return;
    if(action==="confirm"&&draft.preview.questions.length){setAttempted(true);setEdit(structuredClone(draft.plan));setStatus(draft.preview.questions[0]);return;}
    setPending(true);setStatus("");
    try {
      const response=await fetch(`/api/agent/drafts/${draft.id}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,revision:draft.revision,...(action==="edit"?{plan:edit}:action==="confirm"?{confirmed:true}:{})}),signal:AbortSignal.timeout(20000)});
      const body=await response.json();if(!response.ok)throw new Error(body.error);
      if(action==="edit"){setDraft(body.data);setEdit(null);setStatus("پیش‌نمایش تازه آماده است؛ آن را دوباره تأیید کن.");}
      else if(action==="cancel"){setDraft(null);setEdit(null);setStatus("پیشنهاد لغو شد؛ چیزی ثبت یا زمان‌بندی نشد.");}
      else {
        setDraft(null);setEdit(null);let native="";
        try{native=await syncApprovedDeviceReminders();}catch{native="ثبت انجام شد، اما تنظیم Notification انجام نشد؛ دوباره بررسی کن.";}
        setStatus(`${body.data.message} ${body.data.remindersScheduled} یادآوری سرور زمان‌بندی شد. ${body.data.devicePending?native:""}`);await onChanged();
      }
    }catch(error){setStatus(error instanceof Error?error.message:"پاسخ دریافت نشد؛ تأیید دوباره مورد تکراری نمی‌سازد.");}finally{setPending(false);}
  }
  function change<K extends keyof Plan>(key:K,value:Plan[K]){if(edit)setEdit({...edit,[key]:value});}
  const p=edit??draft?.plan;
  const summary=p?approvalSummary(p):null;
  const fieldError=(pattern:RegExp)=>attempted&&draft?.preview.questions.find(q=>pattern.test(q));
  const format=(value:string)=>new Intl.DateTimeFormat("fa-IR",{timeZone:p?.timezone??"Asia/Tehran",dateStyle:"medium",timeStyle:"short",hourCycle:"h23",calendar:"persian"}).format(new Date(value));
  return <section className="assistant-panel" aria-label="گفتگو با tia">
    {needsAccount && <p className="agent-notice" role="alert">حساب باز کنید. <Link href="/login?returnTo=assistant" onClick={()=>offerGuestDraft()}>ثبت‌نام / ورود</Link></p>}
    <div className="suggestions"><button disabled={voiceBusy} onClick={onAdd}>ثبت دستی</button><button disabled={voiceBusy} onClick={()=>setInput("برنامه امروز من را خلاصه کن")}>خلاصه امروز</button></div>
    {reply && <p className="agent-mode">{mode==="online"?"پاسخ واقعی OpenAI":mode==="local-fallback"?"سرویس پاسخ نداد؛ پردازش محلی":mode==="local-budget-limit"?"سقف مصرف رسیده؛ پردازش محلی":"پردازش محلی؛ بدون ارسال متن به سرویس خارجی"}</p>}
    {online && <label className="agent-toggle"><input type="checkbox" checked={external} onChange={e=>setExternal(e.target.checked)} />با ارسال پیام و اطلاعات مرتبط برنامه‌ام به OpenAI موافقم.</label>}
    {reply && !draft && <div className="agent-response"><p>{reply}</p></div>}
    {draft && p && summary && <section ref={review} className="agent-review compact-review" aria-label="پیش‌نمایش تأیید"><h2>بررسی پیش از {operations[p.operation]}</h2>
      <div className="approval-summary" aria-label="خلاصه پیشنهاد">
        <h3>{p.title||"عنوان تعیین نشده"}</h3><p>{summary.category} · {summary.priority} · {summary.when}</p>
        <p>یادآوری: {summary.reminders}</p><p>هشدار: {summary.channels}</p>
        {summary.recurrence&&<p>تکرار برنامه: {summary.recurrence}</p>}{summary.followUp&&<p>{summary.followUp}</p>}
        {p.operation==="DELETE"&&<p className="agent-question">این تأیید، مورد انتخاب‌شده را حذف و هشدارهای آن را لغو می‌کند.</p>}
        {!edit&&draft.preview.warnings.map((w,i)=><p className="approval-warning" key={i}>{w}</p>)}
      </div>
      <div className="agent-actions approval-actions">{edit && JSON.stringify(edit)!==JSON.stringify(draft.plan)?<button disabled={pending||voiceBusy} onClick={()=>void act("edit")}>بررسی تغییرات</button>:<><button disabled={pending||voiceBusy} onClick={()=>void act("confirm")}>ثبت</button><button disabled={pending||voiceBusy} onClick={()=>setEdit(edit?null:structuredClone(draft.plan))}>{edit?"بستن ویرایش":"ویرایش"}</button></>}<button disabled={pending||voiceBusy} onClick={()=>void act("cancel")}>انصراف</button></div>
      <details className="approval-details" open={Boolean(edit)}><summary onClick={e=>{e.preventDefault();setEdit(edit?null:structuredClone(draft.plan));}}>جزئیات بیشتر</summary><div className="approval-editor">
      <fieldset disabled={!edit || pending}><div className="agent-grid">
        <label>عنوان<input value={p.title} maxLength={180} onChange={e=>change("title",e.target.value)} />{fieldError(/عنوان/)&&<small className="field-error">{fieldError(/عنوان/)}</small>}</label>
        <label>دسته‌بندی<select value={p.entity==="MEETING"?"MEETING":p.category} onChange={e=>{if(edit)setEdit({...edit,entity:e.target.value==="MEETING"?"MEETING":"TASK",category:e.target.value==="MEETING"?edit.category:e.target.value as Plan["category"]});}}>{(p.operation==="CREATE"||p.entity==="TASK")&&<><option value="PERSONAL">شخصی</option><option value="WORK">شرکتی</option></>}{(p.operation==="CREATE"||p.entity==="MEETING")&&<option value="MEETING">جلسه</option>}</select></label>
        <label>اولویت<select value={p.priority} onChange={e=>change("priority",e.target.value as Plan["priority"])}><option value="NORMAL">عادی</option><option value="IMPORTANT">مهم</option><option value="URGENT">فوری</option></select></label>
        <label>تاریخ شمسی<PersianDateField value={p.date} onChange={v=>change("date",v)}/>{fieldError(/تاریخ|روز/)&&<small className="field-error">{fieldError(/تاریخ|روز/)}</small>}</label>
        <label>ساعت ۲۴ساعته<Time24Field value={p.time} onChange={v=>{if(edit)setEdit({...edit,time:v,ambiguousTime:null});}}/>{fieldError(/ساعت|زمان/)&&<small className="field-error">{fieldError(/ساعت|زمان/)}</small>}</label>
        <label>تکرار برنامه<select value={p.recurrence} onChange={e=>change("recurrence",e.target.value as Plan["recurrence"])}><option value="NONE">ندارد</option><option value="DAILY">روزانه</option><option value="WEEKLY">هفتگی</option></select></label>
        {p.recurrence!=="NONE" && <label>تعداد نوبت‌ها، با احتساب اولین نوبت<input type="number" min={2} max={12} value={p.occurrenceCount??""} onChange={e=>change("occurrenceCount",e.target.value?Number(e.target.value):null)}/></label>}
        {p.escalation && <><label>تعداد هشدار پس از موعد<input type="number" min={1} max={6} value={p.repeatCount} onChange={e=>change("repeatCount",Number(e.target.value))}/></label>
        <label>فاصله پیگیری هشدار (دقیقه)<input type="number" min={10} max={1440} value={p.repeatMinutes} onChange={e=>change("repeatMinutes",Number(e.target.value))}/></label></>}
        {candidates.length>1 && <label>مورد موردنظر<select value={p.targetId??""} onChange={e=>{const item=candidates.find(i=>i.id===e.target.value);if(edit&&item)setEdit({...edit,targetId:item.id!,title:item.title,entity:item.entity??"TASK"});}}><option value="">انتخاب کن</option>{candidates.map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label>}
      </div>
      <div className="reminder-options">{[1440,180,60].map((minutes,i)=><label key={minutes}><input type="checkbox" checked={p.reminderOffsets.includes(minutes)} onChange={e=>change("reminderOffsets",e.target.checked?[...p.reminderOffsets,minutes].sort((a,b)=>b-a):p.reminderOffsets.filter(m=>m!==minutes))}/>{["یک روز قبل","سه ساعت قبل","یک ساعت قبل"][i]}</label>)}</div>
      {p.reminderOffsets.filter(m=>![1440,180,60].includes(m)).map(m=><label key={m} className="agent-toggle"><input type="checkbox" checked onChange={()=>change("reminderOffsets",p.reminderOffsets.filter(v=>v!==m))}/>{m} دقیقه قبل</label>)}
      <div className="reminder-options">{Object.entries(channels).map(([value,label])=><label key={value}><input type="checkbox" checked={p.channels.includes(value as Plan["channels"][number])} onChange={e=>change("channels",e.target.checked?[...p.channels,value as Plan["channels"][number]]:p.channels.filter(c=>c!==value))}/>{label}</label>)}</div>
      <label className="agent-toggle"><input type="checkbox" checked={p.escalation} onChange={e=>change("escalation",e.target.checked)}/>تشدید هشدار فوری پس از موعد</label></fieldset>
      {!edit && <>{draft.preview.instant && <p>زمان دقیق: {format(draft.preview.instant)}</p>}<p>{p.defaults.join("؛ ")}</p>{draft.preview.questions.map((q,i)=><p className="agent-question" key={i}>{q}</p>)}{draft.preview.warnings.map((w,i)=><p key={i}>{w}</p>)}<ul className="agent-schedule">{draft.preview.schedule.map((s,i)=><li key={i}>{channels[s.channel as keyof typeof channels]}: {format(s.scheduledFor)}</li>)}</ul></>}
      {edit&&draft.preview.questions.map((q,i)=><p className="agent-question" key={i}>{q}</p>)}
      </div></details>
    </section>}
    {status && <p role="status" className="agent-status">{status}</p>}
    <VoiceInput key={owner} disabled={pending||Boolean(edit)} onBusyChange={setVoiceBusy} onText={text=>{setInput(text);void sendMessage(text);}}/>
    <form className="chat-box" onSubmit={send}><textarea ref={textbox} rows={1} aria-label="پیام" placeholder="بنویس یا متن صدا را ویرایش کن…" maxLength={2000} value={input} onChange={e=>setInput(e.target.value)} disabled={pending||voiceBusy}/><button disabled={pending||voiceBusy||Boolean(edit)}>{pending?"در حال بررسی":"ارسال"}</button></form>
  </section>;
}
