"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { enablePushNotifications } from "@/lib/push-client";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

type Category = "personal" | "work" | "meeting";
type Priority = "urgent" | "important" | "normal";
type View = "today" | "tasks" | "calendar" | "assistant";
type Item = { id: string; title: string; category: Category; priority: Priority; date: string; time: string; done: boolean };

const seed: Item[] = [
  { id: "1", title: "مرور گزارش فروش ماهانه", category: "work", priority: "urgent", date: "امروز", time: "۰۹:۳۰", done: false },
  { id: "2", title: "جلسه برنامه‌ریزی محصول", category: "meeting", priority: "important", date: "امروز", time: "۱۱:۰۰", done: false },
  { id: "3", title: "۳۰ دقیقه پیاده‌روی", category: "personal", priority: "normal", date: "امروز", time: "۱۷:۳۰", done: false },
  { id: "4", title: "ارسال پیش‌نویس قرارداد", category: "work", priority: "important", date: "فردا", time: "۱۰:۰۰", done: false },
];
const categories: Record<Category, [string, string]> = { personal: ["شخصی", "mint"], work: ["شرکتی", "lavender"], meeting: ["جلسه", "peach"] };
const priorities: Record<Priority, [string, string]> = { urgent: ["فوری", "rose"], important: ["مهم", "amber"], normal: ["عادی", "sage"] };

export function PersonalAgentDashboard() {
  const [items, setItems] = useState<Item[]>(seed);
  const [view, setView] = useState<View>("today");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [composer, setComposer] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("فعال‌سازی اعلان‌ها");
  const [hydrated, setHydrated] = useState(false);
  const { data: session } = authClient.useSession();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem("hamrah.items.v1"); if (saved) setItems(JSON.parse(saved)); } catch {}
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem("hamrah.items.v1", JSON.stringify(items)); }, [items, hydrated]);
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/tasks")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(({ data }) => setItems(data.map((task: { id: string; title: string; category: string; priority: string; status: string; dueAt?: string }): Item => ({
        id: task.id,
        title: task.title,
        category: task.category === "WORK" ? "work" : "personal",
        priority: task.priority.toLowerCase() as Priority,
        date: task.dueAt ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short" }).format(new Date(task.dueAt)) : "بدون تاریخ",
        time: task.dueAt ? new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(task.dueAt)) : "بدون ساعت",
        done: task.status === "DONE",
      }))))
      .catch(() => {});
  }, [session?.user]);

  const visible = useMemo(() => items.filter((item) => filter === "all" || item.category === filter), [items, filter]);
  const open = items.filter((item) => !item.done).length;
  const done = items.length - open;
  const progress = items.length ? Math.round(done / items.length * 100) : 0;
  const toggle = (id: string) => { const current = items.find((item) => item.id === id); setItems((all) => all.map((item) => item.id === id ? { ...item, done: !item.done } : item)); if (session?.user && current) fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: current.done ? "TODO" : "DONE" }) }); };

  async function enableNotifications() {
    try { await enablePushNotifications(); setNotificationStatus("اعلان‌ها فعال است"); }
    catch (error) { setNotificationStatus(error instanceof Error ? error.message : "فعال‌سازی اعلان ناموفق بود"); }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const title = String(data.get("title") || "").trim(); if (!title) return;
    const item = { id: crypto.randomUUID(), title, category: data.get("category") as Category, priority: data.get("priority") as Priority, date: String(data.get("date") || "امروز"), time: String(data.get("time") || "بدون ساعت"), done: false };
    setItems((all) => [item, ...all]);
    if (session?.user) fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, category: item.category === "work" ? "WORK" : "PERSONAL", priority: item.priority.toUpperCase() }) }).then((response) => response.ok ? response.json() : Promise.reject()).then(({ data: created }) => setItems((all) => all.map((candidate) => candidate.id === item.id ? { ...candidate, id: created.id } : candidate))).catch(() => {});
    form.reset(); setComposer(false);
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">ه</span><div><strong>همراه</strong><small>دستیار شخصی تو</small></div></div>
      <nav aria-label="ناوبری اصلی"><Nav active={view === "today"} icon="⌂" label="امروز" onClick={() => setView("today")} /><Nav active={view === "tasks"} icon="✓" label="کارها" badge={open} onClick={() => setView("tasks")} /><Nav active={view === "calendar"} icon="□" label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} icon="✦" label="گفتگو با همراه" onClick={() => setView("assistant")} /></nav>
      <div className="sidebar-section"><span className="section-label">فضاها</span>{(Object.keys(categories) as Category[]).map((key) => <button className="space-button" key={key} onClick={() => { setView("tasks"); setFilter(key); }}><i className={categories[key][1]} />{categories[key][0]}<small>{items.filter((x) => x.category === key && !x.done).length}</small></button>)}</div>
      <div className="profile"><div className="avatar">{session?.user.name?.slice(0, 1) || "ت"}</div><div><strong>{session?.user.name || "تیام"}</strong><small>{session ? "حساب متصل است" : "نسخه نمایشی"}</small></div>{session ? <button aria-label="خروج" title="خروج" onClick={() => authClient.signOut()}>↪</button> : <Link className="login-link" href="/login">ورود</Link>}</div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">یکشنبه، ۸ شهریور</p><h1>{view === "assistant" ? "گفتگو با همراه" : view === "calendar" ? "تقویم من" : view === "tasks" ? "همه کارها" : "صبح بخیر، تیام 👋"}</h1></div><div className="top-actions"><button className="icon-button" aria-label="اعلان‌ها" title={notificationStatus} onClick={enableNotifications}>♢<span /></button><button className="primary-button" onClick={() => setComposer(true)}>＋ کار جدید</button></div></header>
      {view === "assistant" ? <Assistant onAdd={() => setComposer(true)} /> : view === "calendar" ? <Calendar items={items} /> : <>
        <section className="summary-grid"><article className="focus-card"><div><span className="soft-icon">☀</span><p>تمرکز امروز</p><strong>{open} کار باقی مانده</strong></div><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span>{progress}٪</span></div></article><article className="summary-card peach"><span>◷</span><div><small>جلسه بعدی</small><strong>برنامه‌ریزی محصول</strong><p>امروز، ساعت ۱۱:۰۰</p></div></article><article className="summary-card lavender"><span>✦</span><div><small>پیشنهاد همراه</small><strong>صبح را با کار فوری شروع کن</strong><p>۴۵ دقیقه زمان تمرکز</p></div></article></section>
        <section className="content-card"><div className="card-heading"><div><h2>{view === "today" ? "برنامه امروز" : "فهرست کارها"}</h2><p>آرام و قدم‌به‌قدم پیش برو</p></div><div className="filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>همه</button>{(Object.keys(categories) as Category[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{categories[key][0]}</button>)}</div></div>
          <div className="task-list">{visible.length === 0 ? <div className="empty-state">اینجا فعلاً خلوت است؛ یک کار تازه اضافه کن.</div> : visible.map((item) => <article className={`task-row ${item.done ? "done" : ""}`} key={item.id}><button className="check-button" onClick={() => toggle(item.id)} aria-label="تغییر وضعیت">{item.done ? "✓" : ""}</button><div className="task-main"><strong>{item.title}</strong><div><span className={`tag ${categories[item.category][1]}`}>{categories[item.category][0]}</span><span className={`tag ${priorities[item.priority][1]}`}>{priorities[item.priority][0]}</span></div></div><div className="task-time"><strong>{item.time}</strong><small>{item.date}</small></div><button className="more-button" aria-label="گزینه‌ها">•••</button></article>)}</div>
        </section>
      </>}
    </section>

    <nav className="mobile-nav"><Nav active={view === "today"} icon="⌂" label="امروز" onClick={() => setView("today")} /><Nav active={view === "tasks"} icon="✓" label="کارها" onClick={() => setView("tasks")} /><button className="mobile-add" onClick={() => setComposer(true)}>＋</button><Nav active={view === "calendar"} icon="□" label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} icon="✦" label="همراه" onClick={() => setView("assistant")} /></nav>
    {composer && <div className="modal-backdrop" onMouseDown={() => setComposer(false)}><form className="composer" onSubmit={add} onMouseDown={(e) => e.stopPropagation()}><div className="composer-heading"><div><small>یک قدم تازه</small><h2>چه کاری باید انجام شود؟</h2></div><button type="button" onClick={() => setComposer(false)}>×</button></div><label>عنوان کار<input name="title" autoFocus required placeholder="مثلاً تماس با تیم فروش" /></label><div className="field-grid"><label>دسته‌بندی<select name="category"><option value="personal">شخصی</option><option value="work">شرکتی</option><option value="meeting">جلسه</option></select></label><label>اولویت<select name="priority"><option value="normal">عادی</option><option value="important">مهم</option><option value="urgent">فوری</option></select></label></div><div className="field-grid"><label>روز<select name="date"><option>امروز</option><option>فردا</option><option>این هفته</option></select></label><label>ساعت<input name="time" type="time" /></label></div><button className="submit-button">افزودن به برنامه</button></form></div>}
  </main>;
}

function Nav({ active, icon, label, badge, onClick }: { active: boolean; icon: string; label: string; badge?: number; onClick: () => void }) { return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{label}{badge !== undefined && <small>{badge}</small>}</button>; }
type AgentProposal = { kind: "CREATE_TASK" | "CREATE_MEETING" | "PLAN" | "NONE"; needsApproval: boolean; title?: string; category?: "PERSONAL" | "WORK"; priority?: "URGENT" | "IMPORTANT" | "NORMAL"; startsAt?: string; endsAt?: string; dueAt?: string; reasoning?: string };
function Assistant({ onAdd }: { onAdd: () => void }) {
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
    const body = isMeeting ? { title: proposal.title, startsAt: proposal.startsAt, endsAt: proposal.endsAt, timezone: "Asia/Tehran" } : { title: proposal.title, category: proposal.category || "PERSONAL", priority: proposal.priority || "NORMAL", dueAt: proposal.dueAt };
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setPending(false);
    if (response.ok) { setStatus("انجام شد و در برنامه‌ات ثبت شد."); setProposal(null); } else setStatus("ثبت پیشنهاد انجام نشد؛ زمان‌ها یا اطلاعات را دوباره بررسی کن.");
  }
  return <section className="assistant-panel"><div className="assistant-orb">✦</div><div><p className="eyebrow">همراه آماده است</p><h2>هر چیزی را ساده بگو</h2><p>مثلاً «فردا ساعت ۱۰ جلسه با تیم فروش بذار» یا «کارهای مهم این هفته‌ام را مرتب کن».</p></div>{!session && <p className="agent-notice">برای استفاده از هوش مصنوعی ابتدا <Link href="/login">وارد حساب شو</Link>.</p>}<div className="suggestions"><button onClick={onAdd}>یک کار برای امروز بساز</button><button onClick={() => setInput("برنامه امروز من را خلاصه کن")}>برنامه امروز را خلاصه کن</button><button onClick={() => setInput("برای زمان آزاد امروز پیشنهاد بده")}>برای زمان آزاد پیشنهاد بده</button></div>{reply && <div className="agent-response"><strong>همراه</strong><p>{reply}</p>{proposal && proposal.kind !== "NONE" && <div className="proposal"><span>پیشنهاد برای تأیید</span><strong>{proposal.title || proposal.reasoning}</strong><button onClick={approve} disabled={pending}>تأیید و اجرا</button></div>}</div>}{status && <p className="agent-status">{status}</p>}<form className="chat-box" onSubmit={send}><input aria-label="پیام" placeholder="با همراه صحبت کن..." value={input} onChange={(event) => setInput(event.target.value)} disabled={!session || pending} /><button aria-label="ارسال" disabled={!session || pending}>{pending ? "…" : "←"}</button></form><small className="coming-soon">هیچ عملیاتی بدون تأیید تو اجرا نمی‌شود.</small></section>;
}
function Calendar({ items }: { items: Item[] }) { const days = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"]; return <section className="calendar-card"><div className="card-heading"><div><h2>شهریور ۱۴۰۵</h2><p>نمای کلی هفته پیش رو</p></div><button className="outline-button">امروز</button></div><div className="week-grid">{days.map((day, index) => <div className={`day-column ${index === 1 ? "current" : ""}`} key={day}><header><small>{day}</small><strong>{7 + index}</strong></header>{index === 1 && items.slice(0, 3).map((item) => <div className={`calendar-event ${categories[item.category][1]}`} key={item.id}><small>{item.time}</small><strong>{item.title}</strong></div>)}</div>)}</div></section>; }
