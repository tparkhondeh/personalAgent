"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { enablePushNotifications } from "@/lib/push-client";

type Category = "personal" | "work" | "meeting";
type Priority = "urgent" | "important" | "normal";
type View = "today" | "tasks" | "calendar" | "assistant";
type Item = { id: string; title: string; category: Category; priority: Priority; source: "task" | "meeting"; startsAt?: string; endsAt?: string; dueAt?: string; done: boolean };
type ApiTask = { id: string; title: string; category: "PERSONAL" | "WORK"; priority: "URGENT" | "IMPORTANT" | "NORMAL"; status: string; startAt?: string | null; dueAt?: string | null };
type ApiMeeting = { id: string; title: string; startsAt: string; endsAt: string };

const categories: Record<Category, [string, string]> = { personal: ["شخصی", "mint"], work: ["شرکتی", "lavender"], meeting: ["جلسه", "peach"] };
const priorities: Record<Priority, [string, string]> = { urgent: ["فوری", "rose"], important: ["مهم", "amber"], normal: ["عادی", "sage"] };
const demoItems: Item[] = [
  { id: "demo-1", title: "مرور گزارش فروش ماهانه", category: "work", priority: "urgent", source: "task", done: false },
  { id: "demo-2", title: "جلسه برنامه‌ریزی محصول", category: "meeting", priority: "important", source: "meeting", done: false },
  { id: "demo-3", title: "۳۰ دقیقه پیاده‌روی", category: "personal", priority: "normal", source: "task", done: false },
];
const tehranDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long" });
const tehranShortDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "short", day: "numeric" });
const tehranTime = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" });

function taskToItem(task: ApiTask): Item {
  return { id: task.id, title: task.title, category: task.category === "WORK" ? "work" : "personal", priority: task.priority.toLowerCase() as Priority, source: "task", startsAt: task.startAt || undefined, dueAt: task.dueAt || undefined, done: task.status === "DONE" };
}

function meetingToItem(meeting: ApiMeeting): Item {
  return { id: meeting.id, title: meeting.title, category: "meeting", priority: "important", source: "meeting", startsAt: meeting.startsAt, endsAt: meeting.endsAt, done: false };
}

function itemMoment(item: Item) { return item.startsAt || item.dueAt; }

function dateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isToday(item: Item) { const moment = itemMoment(item); return moment ? dateKey(moment) === dateKey(new Date()) : false; }

function itemDate(item: Item) {
  const moment = itemMoment(item);
  if (!moment) return "بدون تاریخ";
  if (dateKey(moment) === dateKey(new Date())) return "امروز";
  if (dateKey(moment) === dateKey(new Date(Date.now() + 86_400_000))) return "فردا";
  return tehranShortDate.format(new Date(moment));
}

function itemTime(item: Item) { const moment = itemMoment(item); return moment ? tehranTime.format(new Date(moment)) : "بدون ساعت"; }

function localDateInput(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(Date.now() + offsetDays * 86_400_000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function tehranIso(date: string, time: string) { return new Date(`${date}T${time || "09:00"}:00+03:30`).toISOString(); }

export function PersonalAgentDashboard() {
  const [items, setItems] = useState<Item[]>(demoItems);
  const [view, setView] = useState<View>("today");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [composer, setComposer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [notificationStatus, setNotificationStatus] = useState("فعال‌سازی اعلان‌ها");
  const [hydrated, setHydrated] = useState(false);
  const { data: session } = authClient.useSession();
  const signedIn = Boolean(session?.user);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!signedIn) {
        try { const saved = localStorage.getItem("hamrah.items.v2"); if (saved) setItems(JSON.parse(saved)); } catch {}
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [signedIn]);

  useEffect(() => { if (hydrated && !signedIn) localStorage.setItem("hamrah.items.v2", JSON.stringify(items)); }, [items, hydrated, signedIn]);

  const loadRemote = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true); setMessage("");
    try {
      const [tasksResponse, meetingsResponse] = await Promise.all([fetch("/api/tasks"), fetch("/api/meetings")]);
      if (!tasksResponse.ok || !meetingsResponse.ok) throw new Error("دریافت برنامه انجام نشد");
      const [{ data: tasks }, { data: meetings }] = await Promise.all([tasksResponse.json(), meetingsResponse.json()]);
      setItems([...(tasks as ApiTask[]).map(taskToItem), ...(meetings as ApiMeeting[]).map(meetingToItem)].sort((a, b) => new Date(itemMoment(a) || "9999").getTime() - new Date(itemMoment(b) || "9999").getTime()));
    } catch (error) { setMessage(error instanceof Error ? error.message : "دریافت برنامه انجام نشد"); }
    finally { setLoading(false); }
  }, [session?.user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRemote(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRemote]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter !== "all" && item.category !== filter) return false;
    return view !== "today" || isToday(item) || !itemMoment(item);
  }), [items, filter, view]);
  const open = items.filter((item) => item.source === "task" && !item.done).length;
  const tasks = items.filter((item) => item.source === "task");
  const progress = tasks.length ? Math.round(tasks.filter((item) => item.done).length / tasks.length * 100) : 0;
  const nextMeeting = items.filter((item) => item.source === "meeting" && item.startsAt && new Date(item.startsAt) > new Date()).sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())[0];

  async function toggle(item: Item) {
    if (item.source !== "task") return;
    const nextDone = !item.done;
    setItems((all) => all.map((candidate) => candidate.id === item.id ? { ...candidate, done: nextDone } : candidate));
    if (!signedIn) return;
    const response = await fetch(`/api/tasks/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextDone ? "DONE" : "TODO" }) });
    if (!response.ok) {
      setItems((all) => all.map((candidate) => candidate.id === item.id ? { ...candidate, done: !nextDone } : candidate));
      setMessage("تغییر وضعیت ذخیره نشد؛ دوباره تلاش کن.");
    }
  }

  async function remove(item: Item) {
    if (!signedIn) { setItems((all) => all.filter((candidate) => candidate.id !== item.id)); return; }
    const endpoint = item.source === "meeting" ? `/api/meetings/${item.id}` : `/api/tasks/${item.id}`;
    const response = await fetch(endpoint, { method: "DELETE" });
    if (response.ok) setItems((all) => all.filter((candidate) => candidate.id !== item.id));
    else setMessage("حذف انجام نشد؛ دوباره تلاش کن.");
  }

  async function enableNotifications() {
    try { await enablePushNotifications(); setNotificationStatus("اعلان‌ها فعال است"); }
    catch (error) { setNotificationStatus(error instanceof Error ? error.message : "فعال‌سازی اعلان ناموفق بود"); }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const category = data.get("category") as Category;
    const priority = data.get("priority") as Priority;
    const date = String(data.get("date") || localDateInput());
    const time = String(data.get("time") || "09:00");
    const startsAt = tehranIso(date, time);
    if (!title) return;
    setMessage("");
    if (!signedIn) {
      const duration = Number(data.get("duration") || 60);
      setItems((all) => [{ id: crypto.randomUUID(), title, category, priority, source: category === "meeting" ? "meeting" : "task", startsAt: category === "meeting" ? startsAt : undefined, endsAt: category === "meeting" ? new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString() : undefined, dueAt: category === "meeting" ? undefined : startsAt, done: false }, ...all]);
      form.reset(); setComposer(false); return;
    }
    const isMeeting = category === "meeting";
    const duration = Number(data.get("duration") || 60);
    const endpoint = isMeeting ? "/api/meetings" : "/api/tasks";
    const body = isMeeting
      ? { title, startsAt, endsAt: new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString(), timezone: "Asia/Tehran", attendees: [] }
      : { title, category: category === "work" ? "WORK" : "PERSONAL", priority: priority.toUpperCase(), dueAt: startsAt, reminderMinutes: Number(data.get("reminderMinutes") || 15) };
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { const result = await response.json().catch(() => null); setMessage(result?.error || "ثبت برنامه انجام نشد."); return; }
    form.reset(); setComposer(false); await loadRemote();
  }

  const greetingName = session?.user.name?.split(" ")[0] || "دوست من";
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">ه</span><div><strong>همراه</strong><small>دستیار شخصی تو</small></div></div>
      <nav aria-label="ناوبری اصلی"><Nav active={view === "today"} icon="⌂" label="امروز" onClick={() => { setView("today"); setFilter("all"); }} /><Nav active={view === "tasks"} icon="✓" label="کارها" badge={open} onClick={() => setView("tasks")} /><Nav active={view === "calendar"} icon="□" label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} icon="✦" label="گفتگو با همراه" onClick={() => setView("assistant")} /></nav>
      <div className="sidebar-section"><span className="section-label">فضاها</span>{(Object.keys(categories) as Category[]).map((key) => <button className="space-button" key={key} onClick={() => { setView("tasks"); setFilter(key); }}><i className={categories[key][1]} />{categories[key][0]}<small>{items.filter((item) => item.category === key && !item.done).length}</small></button>)}</div>
      <div className="profile"><div className="avatar">{session?.user.name?.slice(0, 1) || "ه"}</div><div><strong>{session?.user.name || "نسخه آزمایشی"}</strong><small>{signedIn ? "حساب متصل است" : "برای ذخیره دائمی وارد شو"}</small></div>{signedIn ? <button aria-label="خروج" title="خروج" onClick={() => authClient.signOut()}>↪</button> : <Link className="login-link" href="/login">ورود</Link>}</div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">{tehranDate.format(new Date())}</p><h1>{view === "assistant" ? "گفتگو با همراه" : view === "calendar" ? "تقویم من" : view === "tasks" ? "همه کارها و جلسات" : `سلام، ${greetingName} 👋`}</h1></div><div className="top-actions"><button className="icon-button" aria-label="اعلان‌ها" title={notificationStatus} onClick={enableNotifications}>♢<span /></button><button className="primary-button" onClick={() => setComposer(true)}>＋ برنامه جدید</button></div></header>
      {message && <p className="page-message">{message}</p>}
      {view === "assistant" ? <Assistant onAdd={() => setComposer(true)} onChanged={loadRemote} /> : view === "calendar" ? <Calendar items={items} /> : <>
        <section className="summary-grid"><article className="focus-card"><div><span className="soft-icon">☀</span><p>تمرکز امروز</p><strong>{open} کار باقی مانده</strong></div><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span>{progress}٪</span></div></article><article className="summary-card peach"><span>◷</span><div><small>جلسه بعدی</small><strong>{nextMeeting?.title || "جلسه‌ای ثبت نشده"}</strong><p>{nextMeeting ? `${itemDate(nextMeeting)}، ساعت ${itemTime(nextMeeting)}` : "برنامه‌ات آزاد است"}</p></div></article><article className="summary-card lavender"><span>✦</span><div><small>پیشنهاد همراه</small><strong>{open ? "از مهم‌ترین کار شروع کن" : "برنامه‌ات مرتب است"}</strong><p>{open ? `${open} کار باز داری` : "زمانی برای استراحت بگذار"}</p></div></article></section>
        <section className="content-card"><div className="card-heading"><div><h2>{view === "today" ? "برنامه امروز" : "فهرست برنامه‌ها"}</h2><p>{signedIn ? "اطلاعات این صفحه از حساب تو خوانده می‌شود" : "این داده‌ها فقط برای نمایش و روی همین دستگاه هستند"}</p></div><div className="filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>همه</button>{(Object.keys(categories) as Category[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{categories[key][0]}</button>)}</div></div>
          <div className="task-list">{loading ? <div className="empty-state">در حال دریافت برنامه…</div> : visible.length === 0 ? <div className="empty-state">اینجا فعلاً خلوت است؛ یک برنامه تازه اضافه کن.</div> : visible.map((item) => <article className={`task-row ${item.done ? "done" : ""}`} key={`${item.source}-${item.id}`}><button className={`check-button ${item.source === "meeting" ? "meeting-check" : ""}`} onClick={() => void toggle(item)} aria-label={item.source === "meeting" ? "جلسه" : "تغییر وضعیت"}>{item.source === "meeting" ? "◷" : item.done ? "✓" : ""}</button><div className="task-main"><strong>{item.title}</strong><div><span className={`tag ${categories[item.category][1]}`}>{categories[item.category][0]}</span><span className={`tag ${priorities[item.priority][1]}`}>{priorities[item.priority][0]}</span></div></div><div className="task-time"><strong>{itemTime(item)}</strong><small>{itemDate(item)}</small></div><button className="more-button delete-button" aria-label={`حذف ${item.title}`} title="حذف" onClick={() => void remove(item)}>×</button></article>)}</div>
        </section>
      </>}
    </section>
    <nav className="mobile-nav"><Nav active={view === "today"} icon="⌂" label="امروز" onClick={() => { setView("today"); setFilter("all"); }} /><Nav active={view === "tasks"} icon="✓" label="کارها" onClick={() => setView("tasks")} /><button className="mobile-add" onClick={() => setComposer(true)}>＋</button><Nav active={view === "calendar"} icon="□" label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} icon="✦" label="همراه" onClick={() => setView("assistant")} /></nav>
    {composer && <Composer onClose={() => setComposer(false)} onSubmit={add} />}
  </main>;
}

function Composer({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [category, setCategory] = useState<Category>("personal");
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="composer" onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}><div className="composer-heading"><div><small>یک قدم تازه</small><h2>{category === "meeting" ? "جلسه جدید" : "کار جدید"}</h2></div><button type="button" onClick={onClose}>×</button></div><label>عنوان<input name="title" autoFocus required placeholder={category === "meeting" ? "مثلاً جلسه با تیم فروش" : "مثلاً تماس با تیم فروش"} /></label><div className="field-grid"><label>دسته‌بندی<select name="category" value={category} onChange={(event) => setCategory(event.target.value as Category)}><option value="personal">شخصی</option><option value="work">شرکتی</option><option value="meeting">جلسه</option></select></label><label>اولویت<select name="priority" disabled={category === "meeting"}><option value="normal">عادی</option><option value="important">مهم</option><option value="urgent">فوری</option></select></label></div><div className="field-grid"><label>تاریخ<input name="date" type="date" defaultValue={localDateInput()} required /></label><label>ساعت<input name="time" type="time" defaultValue="09:00" required /></label></div><div className="field-grid">{category === "meeting" ? <label>مدت جلسه<select name="duration" defaultValue="60"><option value="30">۳۰ دقیقه</option><option value="60">۱ ساعت</option><option value="90">۱.۵ ساعت</option><option value="120">۲ ساعت</option></select></label> : <label>یادآوری<select name="reminderMinutes" defaultValue="15"><option value="0">همان لحظه</option><option value="15">۱۵ دقیقه قبل</option><option value="60">۱ ساعت قبل</option><option value="1440">یک روز قبل</option></select></label>}<span /></div><button className="submit-button">ثبت در برنامه</button></form></div>;
}

function Nav({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: number; onClick: () => void }) { return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{label}{badge !== undefined && <small>{badge}</small>}</button>; }
type AgentProposal = { kind: "CREATE_TASK" | "CREATE_MEETING" | "PLAN" | "NONE"; needsApproval: boolean; title?: string; category?: "PERSONAL" | "WORK"; priority?: "URGENT" | "IMPORTANT" | "NORMAL"; startsAt?: string; endsAt?: string; dueAt?: string; reasoning?: string };

function Assistant({ onAdd, onChanged }: { onAdd: () => void; onChanged: () => Promise<void> }) {
  const { data: session } = authClient.useSession();
  const [input, setInput] = useState(""); const [reply, setReply] = useState(""); const [proposal, setProposal] = useState<AgentProposal | null>(null); const [pending, setPending] = useState(false); const [status, setStatus] = useState("");
  async function send(event: FormEvent) {
    event.preventDefault(); if (!input.trim()) return; setPending(true); setStatus(""); setReply(""); setProposal(null);
    const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: input, timezone: "Asia/Tehran" }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) { setStatus(body.error || "پاسخی دریافت نشد"); return; }
    setReply(body.data.reply); setProposal(body.data.proposal); setInput("");
  }
  async function approve() {
    if (!proposal?.title) return; setPending(true);
    const isMeeting = proposal.kind === "CREATE_MEETING"; const endpoint = isMeeting ? "/api/meetings" : "/api/tasks";
    const body = isMeeting ? { title: proposal.title, startsAt: proposal.startsAt, endsAt: proposal.endsAt, timezone: "Asia/Tehran", attendees: [] } : { title: proposal.title, category: proposal.category || "PERSONAL", priority: proposal.priority || "NORMAL", dueAt: proposal.dueAt };
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setPending(false);
    if (response.ok) { setStatus("انجام شد و در برنامه‌ات ثبت شد."); setProposal(null); await onChanged(); } else setStatus("ثبت پیشنهاد انجام نشد؛ زمان‌ها یا اطلاعات را دوباره بررسی کن.");
  }
  return <section className="assistant-panel"><div className="assistant-orb">✦</div><div><p className="eyebrow">همراه آماده است</p><h2>هر چیزی را ساده بگو</h2><p>مثلاً «فردا ساعت ۱۰ جلسه با تیم فروش بذار» یا «کارهای مهم این هفته‌ام را مرتب کن».</p></div>{!session && <p className="agent-notice">برای استفاده از هوش مصنوعی ابتدا <Link href="/login">وارد حساب شو</Link>.</p>}<div className="suggestions"><button onClick={onAdd}>یک کار برای امروز بساز</button><button onClick={() => setInput("برنامه امروز من را خلاصه کن")}>برنامه امروز را خلاصه کن</button><button onClick={() => setInput("برای زمان آزاد امروز پیشنهاد بده")}>برای زمان آزاد پیشنهاد بده</button></div>{reply && <div className="agent-response"><strong>همراه</strong><p>{reply}</p>{proposal && proposal.kind !== "NONE" && <div className="proposal"><span>پیشنهاد برای تأیید</span><strong>{proposal.title || proposal.reasoning}</strong><button onClick={() => void approve()} disabled={pending}>تأیید و اجرا</button></div>}</div>}{status && <p className="agent-status">{status}</p>}<form className="chat-box" onSubmit={send}><input aria-label="پیام" placeholder="با همراه صحبت کن..." value={input} onChange={(event) => setInput(event.target.value)} disabled={!session || pending} /><button aria-label="ارسال" disabled={!session || pending}>{pending ? "…" : "←"}</button></form><small className="coming-soon">هیچ عملیاتی بدون تأیید تو اجرا نمی‌شود.</small></section>;
}

function Calendar({ items }: { items: Item[] }) {
  const today = new Date(); const daysSinceSaturday = (today.getDay() + 1) % 7; const weekStart = new Date(today); weekStart.setHours(12, 0, 0, 0); weekStart.setDate(today.getDate() - daysSinceSaturday);
  const week = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return date; });
  const monthTitle = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "long", year: "numeric" }).format(today);
  return <section className="calendar-card"><div className="card-heading"><div><h2>{monthTitle}</h2><p>نمای واقعی هفته پیش رو</p></div><button className="outline-button">امروز</button></div><div className="week-grid">{week.map((date) => {
    const current = dateKey(date) === dateKey(today); const events = items.filter((item) => itemMoment(item) && dateKey(itemMoment(item)!) === dateKey(date));
    return <div className={`day-column ${current ? "current" : ""}`} key={date.toISOString()}><header><small>{new Intl.DateTimeFormat("fa-IR", { weekday: "long", timeZone: "Asia/Tehran" }).format(date)}</small><strong>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", timeZone: "Asia/Tehran" }).format(date)}</strong></header>{events.map((item) => <div className={`calendar-event ${categories[item.category][1]}`} key={`${item.source}-${item.id}`}><small>{itemTime(item)}</small><strong>{item.title}</strong></div>)}</div>;
  })}</div></section>;
}
