"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { enablePushNotifications } from "@/lib/push-client";
import { defaultPreferences, PreferencesPanel, type UserPreferences } from "@/components/preferences-panel";
import { NotificationCenter, type AppNotification } from "@/components/notification-center";
import { buildEscalationPlan, defaultEscalationPolicy } from "@/lib/escalations";
import { syncNativeEscalationAlarms, type NativeEscalationAlarm } from "@/lib/native-escalations";
import { getDailyRumiSelection } from "@/lib/daily-rumi";
import { REMINDER_OFFSET_OPTIONS } from "@/lib/reminder-offsets";

type Category = "personal" | "work" | "meeting";
type Priority = "urgent" | "important" | "normal";
type View = "today" | "tasks" | "calendar" | "assistant" | "settings";
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

function localTimeInput(value?: string) {
  if (!value) return "09:00";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

function tehranIso(date: string, time: string) { return new Date(`${date}T${time || "09:00"}:00+03:30`).toISOString(); }

function reminderOffsetsLabel(offsets: readonly number[]) {
  return offsets.map((minutes) => REMINDER_OFFSET_OPTIONS.find((option) => option.minutes === minutes)?.label).filter(Boolean).join("، ");
}

export function PersonalAgentDashboard() {
  const [items, setItems] = useState<Item[]>(demoItems);
  const [view, setView] = useState<View>("today");
  const [filter, setFilter] = useState<Category | "all">("all");
  const [composer, setComposer] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [composerDate, setComposerDate] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [notificationStatus, setNotificationStatus] = useState("فعال‌سازی اعلان‌ها");
  const [notificationCenter, setNotificationCenter] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [escalationRevision, setEscalationRevision] = useState(0);
  const [dailyRumi, setDailyRumi] = useState(() => getDailyRumiSelection());
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

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDailyRumi((current) => {
        const next = getDailyRumiSelection();
        return next.id === current.id ? current : next;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (!hydrated) return;
    let cancelled = false;
    async function syncEscalations() {
      if (signedIn) {
        const response = await fetch("/api/escalations", { method: "POST" });
        if (!response.ok || cancelled) return;
        const result = await response.json();
        const alarms = result.data.alarms as NativeEscalationAlarm[];
        const nativeResult = await syncNativeEscalationAlarms(alarms);
        if (nativeResult.scheduled > 0 && !cancelled) {
          await fetch("/api/escalations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ attemptIds: alarms.map((alarm) => alarm.id) }) });
        }
        return;
      }

      const now = new Date();
      const policy = preferences ? {
        urgentEscalationEnabled: preferences.urgentEscalationEnabled,
        urgentRepeatMinutes: preferences.urgentRepeatMinutes,
        urgentMaxRepeats: preferences.urgentMaxRepeats,
        androidAlarmEnabled: preferences.androidAlarmEnabled,
        highPriorityEnabled: preferences.highPriorityEnabled,
        smsEscalationEnabled: preferences.smsEscalationEnabled,
        callEscalationEnabled: preferences.callEscalationEnabled,
      } : defaultEscalationPolicy;
      const alarms: NativeEscalationAlarm[] = items.filter((item) => item.source === "task" && item.priority === "urgent" && !item.done && item.dueAt && new Date(item.dueAt) <= now).flatMap((item) => buildEscalationPlan(now, policy).filter((entry) => entry.level === "ANDROID_ALARM").map((entry) => ({
        id: `guest:${item.id}:${entry.attemptNumber}`,
        taskId: item.id,
        title: item.title,
        level: "ANDROID_ALARM" as const,
        attemptNumber: entry.attemptNumber,
        scheduledFor: entry.scheduledFor.toISOString(),
      })));
      if (!cancelled) await syncNativeEscalationAlarms(alarms);
    }
    void syncEscalations().catch(() => undefined);
    return () => { cancelled = true; };
  }, [escalationRevision, hydrated, items, preferences, signedIn]);

  const loadNotifications = useCallback(async () => {
    if (!session?.user) return;
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const result = await response.json();
    setNotifications(result.data as AppNotification[]);
  }, [session?.user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNotifications(), 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRemote(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRemote]);

  useEffect(() => {
    if (!session?.user) {
      const timer = window.setTimeout(() => setPreferences(null), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    void fetch("/api/preferences", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json();
      setPreferences(result.data as UserPreferences | null);
      if (!result.data) setView((currentView) => currentView === "today" ? "settings" : currentView);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [session?.user]);

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
    try {
      const response = await fetch(`/api/tasks/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextDone ? "DONE" : "TODO" }) });
      if (!response.ok) throw new Error("STATUS_UPDATE_FAILED");
      setEscalationRevision((value) => value + 1);
    } catch {
      setItems((all) => all.map((candidate) => candidate.id === item.id ? { ...candidate, done: !nextDone } : candidate));
      setMessage("تغییر وضعیت ذخیره نشد؛ دوباره تلاش کن.");
    }
  }

  async function remove(item: Item) {
    if (!signedIn) { setItems((all) => all.filter((candidate) => candidate.id !== item.id)); setPendingDelete(""); return; }
    const endpoint = item.source === "meeting" ? `/api/meetings/${item.id}` : `/api/tasks/${item.id}`;
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) throw new Error("DELETE_FAILED");
      setItems((all) => all.filter((candidate) => candidate.id !== item.id));
      setPendingDelete("");
    } catch {
      setMessage("حذف انجام نشد؛ دوباره تلاش کن.");
    }
  }

  async function enableNotifications() {
    try { const result = await enablePushNotifications(); setNotificationStatus(result.mode === "push" ? "اعلان‌های کامل فعال است" : "اعلان محلی فعال است"); }
    catch (error) { setNotificationStatus(error instanceof Error ? error.message : "فعال‌سازی اعلان ناموفق بود"); }
  }

  async function markNotificationsRead(id?: string) {
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) });
      if (!response.ok) throw new Error("NOTIFICATION_UPDATE_FAILED");
      const readAt = new Date().toISOString();
      setNotifications((all) => all.map((notification) => !id || notification.id === id ? { ...notification, readAt } : notification));
    } catch {
      setMessage("به‌روزرسانی اعلان انجام نشد.");
    }
  }

  function openComposer(item: Item | null = null, date?: string) { setEditing(item); setComposerDate(date); setComposer(true); }
  function closeComposer() { setEditing(null); setComposerDate(undefined); setComposer(false); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const category = data.get("category") as Category;
    const priority = category === "meeting" ? "important" : data.get("priority") as Priority;
    const date = String(data.get("date") || "");
    const time = String(data.get("time") || "09:00");
    if (category === "meeting" && !date) { setMessage("تاریخ جلسه الزامی است."); return; }
    const startsAt = date ? tehranIso(date, time) : undefined;
    if (!title) return;
    setMessage("");
    if (!signedIn) {
      const duration = Number(data.get("duration") || 60);
      const nextItem: Item = { id: editing?.id || crypto.randomUUID(), title, category, priority, source: category === "meeting" ? "meeting" : "task", startsAt: category === "meeting" ? startsAt : undefined, endsAt: category === "meeting" && startsAt ? new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString() : undefined, dueAt: category === "meeting" ? undefined : startsAt, done: editing?.done || false };
      setItems((all) => editing ? all.map((item) => item.id === editing.id && item.source === editing.source ? nextItem : item) : [nextItem, ...all]);
      form.reset(); closeComposer(); return;
    }
    const isMeeting = category === "meeting";
    const duration = Number(data.get("duration") || 60);
    if (isMeeting && !startsAt) { setMessage("تاریخ جلسه الزامی است."); return; }
    const endpoint = isMeeting ? editing ? `/api/meetings/${editing.id}` : "/api/meetings" : editing ? `/api/tasks/${editing.id}` : "/api/tasks";
    const body = isMeeting
      ? { title, startsAt: startsAt!, endsAt: new Date(new Date(startsAt!).getTime() + duration * 60_000).toISOString(), timezone: "Asia/Tehran", ...(editing ? {} : { attendees: [] }) }
      : { title, category: category === "work" ? "WORK" : "PERSONAL", priority: priority.toUpperCase(), dueAt: startsAt ?? null };
    try {
      const response = await fetch(endpoint, { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { const result = await response.json().catch(() => null); setMessage(result?.error || "ثبت برنامه انجام نشد."); return; }
      form.reset(); closeComposer(); await loadRemote();
    } catch {
      setMessage("ارتباط با برنامه برقرار نشد؛ دوباره تلاش کن.");
    }
  }

  const unreadNotifications = notifications.filter((notification) => !notification.readAt).length;
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">ه</span><div><strong>همراه</strong><small>دستیار شخصی تو</small></div></div>
      <nav aria-label="ناوبری اصلی"><Nav active={view === "today"} label="امروز" onClick={() => { setView("today"); setFilter("all"); }} /><Nav active={view === "tasks"} label="کارها" badge={open} onClick={() => setView("tasks")} /><Nav active={view === "calendar"} label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} label="گفتگو با همراه" onClick={() => setView("assistant")} /><Nav active={view === "settings"} label="تنظیمات برنامه‌ریزی" onClick={() => setView("settings")} /></nav>
      <div className="sidebar-section"><span className="section-label">فضاها</span>{(Object.keys(categories) as Category[]).map((key) => <button className="space-button" key={key} onClick={() => { setView("tasks"); setFilter(key); }}><i className={categories[key][1]} />{categories[key][0]}<small>{items.filter((item) => item.category === key && !item.done).length}</small></button>)}</div>
      <div className="profile"><div className="avatar">{session?.user.name?.slice(0, 1) || "ه"}</div><div><strong>{session?.user.name || "نسخه آزمایشی"}</strong><small>{signedIn ? "حساب متصل است" : "برای ذخیره دائمی وارد شو"}</small></div>{signedIn ? <button aria-label="خروج" title="خروج" onClick={() => authClient.signOut()}>خروج</button> : <Link className="login-link" href="/login">ورود</Link>}</div>
    </aside>
    <section className="workspace">
      <header className="topbar">
        <div className={view === "today" ? "daily-poem-wrap" : undefined}>
          <p className="eyebrow">{tehranDate.format(new Date())}</p>
          {view === "today" ? <>
            <h1 className="daily-poem" aria-label={`شعر روز مولانا: ${dailyRumi.lines.join("، ")}`}>
              <span className="poem-couplet"><span>{dailyRumi.lines[0]}</span><span>{dailyRumi.lines[1]}</span></span>
              <span className="poem-couplet"><span>{dailyRumi.lines[2]}</span><span>{dailyRumi.lines[3]}</span></span>
            </h1>
            <a className="poem-source" href={dailyRumi.sourceUrl} target="_blank" rel="noreferrer">مولانا · {dailyRumi.poemTitle} · گنجور</a>
          </> : <h1>{view === "settings" ? "تنظیمات من" : view === "assistant" ? "گفتگو با همراه" : view === "calendar" ? "تقویم من" : "همه کارها و جلسات"}</h1>}
        </div>
        <div className="top-actions"><button className="settings-button" onClick={() => setView("settings")}>تنظیمات</button><button className="icon-button" aria-label="اعلان‌ها" title="مرکز اعلان‌ها" onClick={() => { const next = !notificationCenter; setNotificationCenter(next); if (next) void loadNotifications(); }}>اعلان{unreadNotifications > 0 && <span>{unreadNotifications}</span>}</button><button className="primary-button" onClick={() => openComposer()}>برنامه جدید</button></div>
      </header>
      {message && <p className="page-message">{message}</p>}
      {view === "settings" ? <PreferencesPanel key={preferences ? "stored" : "default"} initial={preferences} signedIn={signedIn} onSaved={setPreferences} onNativePermissionChanged={() => setEscalationRevision((value) => value + 1)} /> : view === "assistant" ? <Assistant onAdd={() => openComposer()} onChanged={loadRemote} /> : view === "calendar" ? <Calendar items={items} onEdit={openComposer} onAdd={(date) => openComposer(null, date)} /> : <>
        <section className="summary-grid"><article className="focus-card"><div><p>تمرکز امروز</p><strong>{open} کار باقی مانده</strong></div><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span>{progress}٪</span></div></article><article className="summary-card peach"><div><small>جلسه بعدی</small><strong>{nextMeeting?.title || "جلسه‌ای ثبت نشده"}</strong><p>{nextMeeting ? `${itemDate(nextMeeting)}، ساعت ${itemTime(nextMeeting)}` : "برنامه‌ات آزاد است"}</p></div></article><article className="summary-card lavender"><div><small>پیشنهاد همراه</small><strong>{open ? "از مهم‌ترین کار شروع کن" : "برنامه‌ات مرتب است"}</strong><p>{open ? `${open} کار باز داری` : "زمانی برای استراحت بگذار"}</p></div></article></section>
        <section className="content-card"><div className="card-heading"><div><h2>{view === "today" ? "برنامه امروز" : "فهرست برنامه‌ها"}</h2><p>{signedIn ? "اطلاعات این صفحه از حساب تو خوانده می‌شود" : "این داده‌ها فقط برای نمایش و روی همین دستگاه هستند"}</p></div><div className="filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>همه</button>{(Object.keys(categories) as Category[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{categories[key][0]}</button>)}</div></div>
          <div className="task-list">{loading ? <div className="empty-state">در حال دریافت برنامه…</div> : visible.length === 0 ? <div className="empty-state">اینجا فعلاً خلوت است؛ یک برنامه تازه اضافه کن.</div> : visible.map((item) => { const itemKey = `${item.source}-${item.id}`; const confirming = pendingDelete === itemKey; return <article className={`task-row ${item.done ? "done" : ""}`} key={itemKey}><button className={`check-button ${item.source === "meeting" ? "meeting-check" : ""}`} onClick={() => void toggle(item)} aria-label={item.source === "meeting" ? "جلسه" : "تغییر وضعیت"}>{item.source === "meeting" ? "" : item.done ? "✓" : ""}</button><div className="task-main"><strong>{item.title}</strong><div><span className={`tag ${categories[item.category][1]}`}>{categories[item.category][0]}</span><span className={`tag ${priorities[item.priority][1]}`}>{priorities[item.priority][0]}</span></div></div><div className="task-time"><strong>{itemTime(item)}</strong><small>{itemDate(item)}</small></div><div className="item-actions">{confirming ? <><button className="delete-button confirm-delete" onClick={() => void remove(item)}>تأیید حذف</button><button className="edit-button" onClick={() => setPendingDelete("")}>انصراف</button></> : <><button className="edit-button" onClick={() => openComposer(item)}>ویرایش</button><button className="delete-button" onClick={() => setPendingDelete(itemKey)}>حذف</button></>}</div></article>; })}</div>
        </section>
      </>}
    </section>
    <nav className="mobile-nav"><Nav active={view === "today"} label="امروز" onClick={() => { setView("today"); setFilter("all"); }} /><Nav active={view === "tasks"} label="کارها" onClick={() => setView("tasks")} /><button className="mobile-add" aria-label="برنامه جدید" onClick={() => openComposer()}>جدید</button><Nav active={view === "calendar"} label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} label="همراه" onClick={() => setView("assistant")} /></nav>
    {composer && <Composer initial={editing} initialDate={composerDate} defaultReminderOffsets={preferences?.defaultReminderOffsets ?? defaultPreferences.defaultReminderOffsets} onClose={closeComposer} onSubmit={save} />}
    {notificationCenter && <NotificationCenter notifications={notifications} signedIn={signedIn} pushStatus={notificationStatus} onClose={() => setNotificationCenter(false)} onEnablePush={() => void enableNotifications()} onRead={(id) => void markNotificationsRead(id)} />}
  </main>;
}

function Composer({ initial, initialDate, defaultReminderOffsets, onClose, onSubmit }: { initial: Item | null; initialDate?: string; defaultReminderOffsets: number[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [category, setCategory] = useState<Category>(initial?.category || "personal");
  const moment = initial ? itemMoment(initial) : undefined;
  const duration = initial?.source === "meeting" && initial.startsAt && initial.endsAt ? String(Math.round((new Date(initial.endsAt).getTime() - new Date(initial.startsAt).getTime()) / 60_000)) : "60";
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const titleId = "composer-title";
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="composer" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}><div className="composer-heading"><div><small>{initial ? "به‌روزرسانی برنامه" : "یک قدم تازه"}</small><h2 id={titleId}>{initial ? category === "meeting" ? "ویرایش جلسه" : "ویرایش کار" : category === "meeting" ? "جلسه جدید" : "کار جدید"}</h2></div><button type="button" onClick={onClose}>بستن</button></div><label>عنوان<input name="title" autoFocus required defaultValue={initial?.title} placeholder={category === "meeting" ? "مثلاً جلسه با تیم فروش" : "مثلاً تماس با تیم فروش"} /></label><div className="field-grid"><label>دسته‌بندی<select name="category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>{initial?.source === "meeting" ? <option value="meeting">جلسه</option> : <><option value="personal">شخصی</option><option value="work">شرکتی</option>{!initial && <option value="meeting">جلسه</option>}</>}</select></label><label>اولویت<select name="priority" disabled={category === "meeting"} defaultValue={initial?.priority || "normal"}><option value="normal">عادی</option><option value="important">مهم</option><option value="urgent">فوری</option></select></label></div><div className="field-grid"><label>{category === "meeting" ? "تاریخ" : "تاریخ (اختیاری)"}<input name="date" type="date" defaultValue={moment ? dateKey(moment) : initialDate || (initial ? "" : localDateInput())} required={category === "meeting"} /></label><label>ساعت<input name="time" type="time" defaultValue={localTimeInput(moment)} required={category === "meeting"} /></label></div>{category === "meeting" && <div className="field-grid"><label>مدت جلسه<select name="duration" defaultValue={duration}><option value="30">۳۰ دقیقه</option><option value="60">۱ ساعت</option><option value="90">۱.۵ ساعت</option><option value="120">۲ ساعت</option></select></label><span /></div>}<div className="composer-reminder-summary"><strong>یادآوری‌های فعال</strong><span>{reminderOffsetsLabel(defaultReminderOffsets)}</span><small>از بخش تنظیمات برنامه‌ریزی قابل تغییر است.</small></div><button className="submit-button">{initial ? "ذخیره تغییرات" : "ثبت در برنامه"}</button></form></div>;
}

function Nav({ active, label, badge, onClick }: { active: boolean; label: string; badge?: number; onClick: () => void }) { return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{label}{badge !== undefined && <small>{badge}</small>}</button>; }
type AgentProposal = { kind: "CREATE_TASK" | "CREATE_MEETING" | "PLAN" | "NONE"; needsApproval: boolean; title?: string; category?: "PERSONAL" | "WORK"; priority?: "URGENT" | "IMPORTANT" | "NORMAL"; startsAt?: string; endsAt?: string; dueAt?: string; reasoning?: string };

function Assistant({ onAdd, onChanged }: { onAdd: () => void; onChanged: () => Promise<void> }) {
  const { data: session } = authClient.useSession();
  const [input, setInput] = useState(""); const [reply, setReply] = useState(""); const [proposal, setProposal] = useState<AgentProposal | null>(null); const [pending, setPending] = useState(false); const [status, setStatus] = useState(""); const [conversationId, setConversationId] = useState<string>();
  async function send(event: FormEvent) {
    event.preventDefault(); if (!input.trim()) return; setPending(true); setStatus(""); setReply(""); setProposal(null);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: input, timezone: "Asia/Tehran", conversationId }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data) { setStatus(body?.error || "پاسخی دریافت نشد"); return; }
      setReply(body.data.reply); setProposal(body.data.proposal); setConversationId(body.data.conversationId); setInput("");
    } catch {
      setStatus("ارتباط با دستیار برقرار نشد؛ دوباره تلاش کن.");
    } finally {
      setPending(false);
    }
  }
  async function approve() {
    if (!proposal?.title) return; setPending(true);
    const isMeeting = proposal.kind === "CREATE_MEETING"; const endpoint = isMeeting ? "/api/meetings" : "/api/tasks";
    const body = isMeeting ? { title: proposal.title, startsAt: proposal.startsAt, endsAt: proposal.endsAt, timezone: "Asia/Tehran", attendees: [] } : { title: proposal.title, category: proposal.category || "PERSONAL", priority: proposal.priority || "NORMAL", dueAt: proposal.dueAt };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { setStatus("ثبت پیشنهاد انجام نشد؛ زمان‌ها یا اطلاعات را دوباره بررسی کن."); return; }
      setStatus("انجام شد و در برنامه‌ات ثبت شد."); setProposal(null); await onChanged();
    } catch {
      setStatus("ارتباط با برنامه برقرار نشد؛ دوباره تلاش کن.");
    } finally {
      setPending(false);
    }
  }
  const actionableProposal = proposal?.kind === "CREATE_TASK" || proposal?.kind === "CREATE_MEETING";
  return <section className="assistant-panel" aria-label="گفتگو با همراه">{!session && <p className="agent-notice">برای استفاده از دستیار ابتدا <Link href="/login">وارد حساب شو</Link>.</p>}<div className="suggestions"><button onClick={onAdd}>یک کار برای امروز بساز</button><button onClick={() => setInput("برنامه امروز من را خلاصه کن")}>برنامه امروز را خلاصه کن</button><button onClick={() => setInput("برای زمان آزاد امروز پیشنهاد بده")}>برای زمان آزاد پیشنهاد بده</button></div>{reply && <div className="agent-response"><strong>همراه</strong><p>{reply}</p>{proposal && proposal.kind !== "NONE" && <div className="proposal"><span>{actionableProposal ? "پیشنهاد برای تأیید" : "پیشنهاد برنامه‌ریزی"}</span><strong>{proposal.title || proposal.reasoning}</strong>{actionableProposal && <button onClick={() => void approve()} disabled={pending}>تأیید و اجرا</button>}</div>}</div>}{status && <p className="agent-status">{status}</p>}<form className="chat-box" onSubmit={send}><input aria-label="پیام" placeholder="با همراه صحبت کن..." value={input} onChange={(event) => setInput(event.target.value)} disabled={!session || pending} /><button aria-label="ارسال" disabled={!session || pending}>{pending ? "در حال بررسی" : "ارسال"}</button></form></section>;
}

function Calendar({ items, onEdit, onAdd }: { items: Item[]; onEdit: (item: Item) => void; onAdd: (date: string) => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date(); const daysSinceSaturday = (today.getDay() + 1) % 7; const weekStart = new Date(today); weekStart.setHours(12, 0, 0, 0); weekStart.setDate(today.getDate() - daysSinceSaturday + weekOffset * 7);
  const week = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + index); return date; });
  const monthTitle = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "long", year: "numeric" }).format(week[3]);
  return <section className="calendar-card"><div className="card-heading"><div><h2>{monthTitle}</h2><p>برای ویرایش روی هر برنامه بزن؛ برای افزودن، روز موردنظر را انتخاب کن.</p></div><div className="calendar-controls"><button className="outline-button" onClick={() => setWeekOffset((value) => value - 1)}>هفته قبل</button><button className="outline-button" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>امروز</button><button className="outline-button" onClick={() => setWeekOffset((value) => value + 1)}>هفته بعد</button></div></div><div className="week-grid">{week.map((date) => {
    const current = dateKey(date) === dateKey(today); const events = items.filter((item) => itemMoment(item) && dateKey(itemMoment(item)!) === dateKey(date));
    return <div className={`day-column ${current ? "current" : ""}`} key={date.toISOString()}><header><small>{new Intl.DateTimeFormat("fa-IR", { weekday: "long", timeZone: "Asia/Tehran" }).format(date)}</small><strong>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", timeZone: "Asia/Tehran" }).format(date)}</strong></header>{events.map((item) => <button className={`calendar-event ${categories[item.category][1]}`} key={`${item.source}-${item.id}`} onClick={() => onEdit(item)} aria-label={`ویرایش ${item.title}`}><small>{itemTime(item)}</small><strong>{item.title}</strong></button>)}<button className="calendar-add" onClick={() => onAdd(dateKey(date))}>افزودن برنامه</button></div>;
  })}</div></section>;
}
