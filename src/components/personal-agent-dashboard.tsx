"use client";
import { TiaMark } from "@/components/tia-mark";
import { DailyPoem } from "@/components/daily-poem";
import { PersianDateField, Time24Field } from "@/components/persian-date-time";
import { planInstant } from "@/lib/agent-planner";
import { validTime24, persianParts } from "@/lib/persian-inputs";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { enablePushNotifications } from "@/lib/push-client";
import { defaultPreferences, PreferencesPanel, type UserPreferences } from "@/components/preferences-panel";
import { NotificationCenter, type AppNotification } from "@/components/notification-center";
import { buildEscalationPlan, defaultEscalationPolicy } from "@/lib/escalations";
import { syncNativeEscalationAlarms, type NativeEscalationAlarm } from "@/lib/native-escalations";
import { getDailyRumiSelection, getRumiSelection, rumiSelectionCount } from "@/lib/daily-rumi";
import { createPoemNavigator, selectDashboardItems, summarizeDashboardItems, tehranDayKey } from "@/lib/dashboard-overview";
import { REMINDER_OFFSET_OPTIONS } from "@/lib/reminder-offsets";
import { AgentAssistant } from "@/components/agent-assistant";
import { ActionIcon } from "@/components/action-icon";
import { fitProgramList } from "@/lib/list-viewport";
import { clearApprovedDeviceReminders, syncApprovedDeviceReminders } from "@/lib/approved-device-reminders";

type Category = "personal" | "work" | "meeting";
type Priority = "urgent" | "important" | "normal";
type View = "today" | "tasks" | "calendar" | "assistant" | "settings";
type Item = { id: string; title: string; category: Category; priority: Priority; source: "task" | "meeting"; startsAt?: string; endsAt?: string; timezone?: string; dueAt?: string; done: boolean };
type ApiTask = { id: string; title: string; category: "PERSONAL" | "WORK"; priority: "URGENT" | "IMPORTANT" | "NORMAL"; status: string; startAt?: string | null; dueAt?: string | null };
type ApiMeeting = { id: string; title: string; startsAt: string; endsAt: string; timezone?: string; status?: string };

const categories: Record<Category, [string, string]> = { personal: ["شخصی", "mint"], work: ["شرکتی", "lavender"], meeting: ["جلسه", "peach"] };
const priorities: Record<Priority, [string, string]> = { urgent: ["فوری", "rose"], important: ["مهم", "amber"], normal: ["عادی", "sage"] };
const demoItems: Item[] = [
  { id: "demo-1", title: "مرور گزارش فروش ماهانه", category: "work", priority: "urgent", source: "task", done: false },
  { id: "demo-2", title: "جلسه برنامه‌ریزی محصول", category: "meeting", priority: "important", source: "meeting", done: false },
  { id: "demo-3", title: "۳۰ دقیقه پیاده‌روی", category: "personal", priority: "normal", source: "task", done: false },
];
const tehranDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long" });
const tehranGregorianDate = new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { timeZone: "Asia/Tehran", day: "numeric", month: "long", year: "numeric" });
const tehranShortDate = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "short", day: "numeric" });
const tehranTime = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function taskToItem(task: ApiTask): Item {
  return { id: task.id, title: task.title, category: task.category === "WORK" ? "work" : "personal", priority: task.priority.toLowerCase() as Priority, source: "task", startsAt: task.startAt || undefined, dueAt: task.dueAt || undefined, done: task.status === "DONE" };
}

function meetingToItem(meeting: ApiMeeting): Item {
  return { id: meeting.id, title: meeting.title, category: "meeting", priority: "important", source: "meeting", startsAt: meeting.startsAt, endsAt: meeting.endsAt, timezone: meeting.timezone, done: meeting.status === "DONE" };
}

function itemMoment(item: Item) { return item.startsAt || item.dueAt; }

function dateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

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

function tehranIso(date: string, time: string) { return planInstant(date, time || "09:00", "Asia/Tehran")!.toISOString(); }

function reminderOffsetsLabel(offsets: readonly number[]) {
  return offsets.map((minutes) => REMINDER_OFFSET_OPTIONS.find((option) => option.minutes === minutes)?.label).filter(Boolean).join("، ");
}

export function PersonalAgentDashboard() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <main className="session-loading" role="status">در حال آماده‌سازی tia…</main>;
  // A new account boundary discards private in-memory state and late responses.
  // An authenticated component must never become the guest localStorage writer.
  return <SessionDashboard key={session?.user.id ? `user:${session.user.id}` : "guest"} session={session} />;
}

function SessionDashboard({ session }: { session: ReturnType<typeof authClient.useSession>["data"] }) {
  useEffect(() => {
    if(!session?.user.id)return;
    const sync=()=>{void syncApprovedDeviceReminders().catch(()=>{});};
    sync(); const interval=setInterval(sync,30000); window.addEventListener("focus",sync);
    return()=>{clearInterval(interval);window.removeEventListener("focus",sync);void clearApprovedDeviceReminders().catch(()=>{});};
  },[session?.user.id]);
  const [items, setItems] = useState<Item[]>(() => session?.user ? [] : demoItems);
  const [view, setView] = useState<View>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "assistant" ? "assistant" : "today");
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
  const [dashboardDay, setDashboardDay] = useState(() => tehranDayKey());
  const poemNavigator = useRef<ReturnType<typeof createPoemNavigator> | null>(null);
  const toggling = useRef(new Set<string>());
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
    const navigator = createPoemNavigator(rumiSelectionCount, {
      getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
    });
    poemNavigator.current = navigator;
    const refresh = () => {
      setDashboardDay(tehranDayKey());
      setDailyRumi((current) => {
        const next = getRumiSelection(navigator.current());
        return next.id === current.id ? current : next;
      });
    };
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh); window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); document.removeEventListener("visibilitychange", refresh); };
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

  const visible = useMemo(() => selectDashboardItems(items, view, filter, new Date(dashboardDay + "T12:00:00Z")), [items, filter, view, dashboardDay]);
  const overview = summarizeDashboardItems(visible);
  const open = items.filter((item) => item.source === "task" && !item.done).length;

  async function toggle(item: Item) {
    const key = `${item.source}:${item.id}`;
    if (toggling.current.has(key)) return;
    toggling.current.add(key);
    const nextDone = !item.done;
    const matches = (candidate: Item) => candidate.id === item.id && candidate.source === item.source;
    setItems((all) => all.map((candidate) => matches(candidate) ? { ...candidate, done: nextDone } : candidate));
    if (!signedIn) { toggling.current.delete(key); return; }
    try {
      const response = await fetch(`/api/${item.source === "meeting" ? "meetings" : "tasks"}/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: nextDone ? "DONE" : item.source === "meeting" ? "SCHEDULED" : "TODO" }) });
      if (!response.ok) throw new Error("STATUS_UPDATE_FAILED");
      setEscalationRevision((value) => value + 1);
      void syncApprovedDeviceReminders().catch(() => {});
    } catch {
      setItems((all) => all.map((candidate) => matches(candidate) ? { ...candidate, done: !nextDone } : candidate));
      setMessage("تغییر وضعیت ذخیره نشد؛ دوباره تلاش کن.");
    } finally { toggling.current.delete(key); }
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

  function openComposer(item: Item | null = null, date?: string) { document.dispatchEvent(new Event("tia-cancel-voice")); setEditing(item); setComposerDate(date); setComposer(true); }
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
    if(date && (!persianParts(date)||!validTime24(time))){setMessage("تاریخ شمسی و ساعت ۲۴ساعته معتبر وارد کن.");return;}
    const startsAt = date ? tehranIso(date, time) : undefined;
    if (!title) return;
    setMessage("");
    if (!signedIn) {
      const duration = editing?.source === "meeting" && editing.startsAt && editing.endsAt ? (Date.parse(editing.endsAt)-Date.parse(editing.startsAt))/60000 : 60;
      const nextItem: Item = { id: editing?.id || crypto.randomUUID(), title, category, priority, source: category === "meeting" ? "meeting" : "task", startsAt: category === "meeting" ? startsAt : undefined, endsAt: category === "meeting" && startsAt ? new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString() : undefined, dueAt: category === "meeting" ? undefined : startsAt, done: editing?.done || false };
      setItems((all) => editing ? all.map((item) => item.id === editing.id && item.source === editing.source ? nextItem : item) : [nextItem, ...all]);
      form.reset(); closeComposer(); return;
    }
    const isMeeting = category === "meeting";
    const duration = editing?.source === "meeting" && editing.startsAt && editing.endsAt ? (Date.parse(editing.endsAt)-Date.parse(editing.startsAt))/60000 : 60;
    if (isMeeting && !startsAt) { setMessage("تاریخ جلسه الزامی است."); return; }
    const endpoint = isMeeting ? editing ? `/api/meetings/${editing.id}` : "/api/meetings" : editing ? `/api/tasks/${editing.id}` : "/api/tasks";
    const body = isMeeting
      ? { title, startsAt: startsAt!, endsAt: new Date(new Date(startsAt!).getTime() + duration * 60_000).toISOString(), timezone: editing?.timezone || preferences?.timezone || "Asia/Tehran", ...(editing ? {} : { attendees: [] }) }
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
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current; if (!list) return;
    let frame = 0;
    const resize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => fitProgramList(list, view === "today")); };
    const observer = new ResizeObserver(resize);
    observer.observe(list); if (list.firstElementChild) observer.observe(list.firstElementChild);
    resize(); window.addEventListener("resize", resize); window.visualViewport?.addEventListener("resize", resize);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, [view, filter, visible.length, loading]);
  return <main className="app-shell" data-view={view}>
    <aside className="sidebar">
      <div className="brand"><TiaMark/><div><strong dir="ltr">tia</strong><small>دستیار شخصی تو</small></div></div>
      <nav aria-label="ناوبری اصلی"><Nav active={view === "today"} label="امروز" onClick={() => { setView("today"); setFilter("all"); }} /><Nav active={view === "tasks"} label="کارها" badge={open} onClick={() => setView("tasks")} /><Nav active={view === "calendar"} label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} label="tia" onClick={() => setView("assistant")} /><button className="nav-button sidebar-add" aria-label="برنامه جدید" title="برنامه جدید" onClick={() => openComposer()}><ActionIcon name="plus" /></button></nav>
      <div className="sidebar-section"><span className="section-label">فضاها</span>{(Object.keys(categories) as Category[]).map((key) => <button className="space-button" key={key} onClick={() => { setView("tasks"); setFilter(key); }}><i className={categories[key][1]} />{categories[key][0]}<small>{items.filter((item) => item.category === key && !item.done).length}</small></button>)}</div>
      <div className="profile"><div className="avatar">{session?.user.name?.slice(0, 1) || "ه"}</div><div><strong>{session?.user.name || "نسخه آزمایشی"}</strong><small>{signedIn ? "حساب متصل است" : "برای ذخیره دائمی وارد شو"}</small></div>{signedIn ? <button aria-label="خروج" title="خروج" onClick={() => authClient.signOut()}>خروج</button> : <Link className="login-link" href="/login">ورود</Link>}</div>
    </aside>
    <section className="workspace">
      <header className="topbar">
        <div className={view === "today" ? "daily-poem-wrap" : undefined}>
          <div className="header-date"><p className="eyebrow">{tehranDate.format(new Date())}</p><p className="gregorian-date">{tehranGregorianDate.format(new Date())}</p></div>
          {view === "today" ? <>
            <div className="poem-row"><DailyPoem lines={dailyRumi.lines} /><button type="button" className="poem-next" aria-label="شعر بعدی" title="شعر بعدی" onClick={() => { if (poemNavigator.current) setDailyRumi(getRumiSelection(poemNavigator.current.next())); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6M20 12H8" /></svg></button></div>
          </> : view !== "assistant" && <h1>{view === "settings" ? "تنظیمات من" : view === "calendar" ? "تقویم من" : "همه کارها و جلسات"}</h1>}
        </div>
        <div className="top-actions"><button className="icon-button" aria-label="تنظیمات" title="تنظیمات" onClick={() => setView("settings")}><ActionIcon name="settings" /></button><button className="icon-button" aria-label={unreadNotifications ? `اعلان‌ها، ${unreadNotifications} خوانده‌نشده` : "اعلان‌ها"} title="مرکز اعلان‌ها" onClick={() => { const next = !notificationCenter; setNotificationCenter(next); if (next) void loadNotifications(); }}><ActionIcon name="bell" />{unreadNotifications > 0 && <span className="unread-dot" aria-hidden="true" />}</button></div>
      </header>
      {message && <p className="page-message">{message}</p>}
      {view === "settings" ? <PreferencesPanel key={preferences ? "stored" : "default"} initial={preferences} signedIn={signedIn} onSaved={setPreferences} onNativePermissionChanged={() => setEscalationRevision((value) => value + 1)} /> : view === "assistant" ? <Assistant onAdd={() => openComposer()} onChanged={loadRemote} /> : view === "calendar" ? <Calendar items={items} onEdit={openComposer} onAdd={(date) => openComposer(null, date)} /> : <>
        <section className="dashboard-overview" aria-label={view === "today" ? "آمار برنامه‌های امروز، همه وضعیت‌ها" : "آمار فهرست فعلی، همه وضعیت‌ها"}>{overview.map(group => <article key={group.key} className={`overview-card overview-${group.key}`} aria-label={group.name}><span dir="ltr">{group.label}</span><strong>{group.total.toLocaleString("fa-IR")}</strong><small>{group.done.toLocaleString("fa-IR")} انجام‌شده</small></article>)}</section>
        <section className="content-card program-card"><div className="card-heading"><div><h2>{view === "today" ? "برنامه امروز" : "فهرست برنامه‌ها"}</h2></div><div className="filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>همه</button>{(Object.keys(categories) as Category[]).map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{categories[key][0]}</button>)}</div></div>
          <div ref={listRef} className="task-list" tabIndex={0} role="region" aria-label={view === "today" ? "فهرست قابل پیمایش امروز" : "فهرست قابل پیمایش کارها"}>{loading ? <div className="empty-state">در حال دریافت برنامه…</div> : visible.length === 0 ? <span className="sr-only">برنامه‌ای در این فهرست نیست.</span> : visible.map((item) => { const itemKey = `${item.source}-${item.id}`; const confirming = pendingDelete === itemKey; return <article className={`task-row ${item.done ? "done" : ""}`} key={itemKey}><button className={`check-button ${item.source === "meeting" ? "meeting-check" : ""}`} onClick={() => void toggle(item)} aria-label={item.source === "meeting" ? item.done ? "بازگرداندن جلسه" : "تکمیل جلسه" : "تغییر وضعیت"}>{item.done ? "✓" : ""}</button><div className="task-main"><strong>{item.title}</strong><div><span className={`tag ${categories[item.category][1]}`}>{categories[item.category][0]}</span><span className={`tag ${priorities[item.priority][1]}`}>{priorities[item.priority][0]}</span></div></div><div className="task-time"><strong>{itemTime(item)}</strong><small>{itemDate(item)}</small></div><div className="item-actions">{confirming ? <><button className="delete-button confirm-delete" onClick={() => void remove(item)}>تأیید حذف</button><button className="edit-button" onClick={() => setPendingDelete("")}>انصراف</button></> : <><button className="edit-button" onClick={() => openComposer(item)}>ویرایش</button><button className="delete-button" onClick={() => setPendingDelete(itemKey)}>حذف</button></>}</div></article>; })}</div>
        </section>
      </>}
    </section>
    <nav className="mobile-nav"><Nav active={view === "today"} label="امروز" onClick={() => { setView("today"); setFilter("all"); }} /><Nav active={view === "tasks"} label="کارها" onClick={() => setView("tasks")} /><button className="mobile-add" aria-label="برنامه جدید" title="برنامه جدید" onClick={() => openComposer()}><ActionIcon name="plus" /></button><Nav active={view === "calendar"} label="تقویم" onClick={() => setView("calendar")} /><Nav active={view === "assistant"} label="tia" onClick={() => setView("assistant")} /></nav>
    {composer && <Composer initial={editing} initialDate={composerDate} defaultReminderOffsets={preferences?.defaultReminderOffsets ?? defaultPreferences.defaultReminderOffsets} onClose={closeComposer} onSubmit={save} />}
    {notificationCenter && <NotificationCenter notifications={notifications} signedIn={signedIn} pushStatus={notificationStatus} onClose={() => setNotificationCenter(false)} onEnablePush={() => void enableNotifications()} onRead={(id) => void markNotificationsRead(id)} />}
  </main>;
}

function Composer({ initial, initialDate, defaultReminderOffsets, onClose, onSubmit }: { initial: Item | null; initialDate?: string; defaultReminderOffsets: number[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [category, setCategory] = useState<Category>(initial?.category || "personal");
  const moment = initial ? itemMoment(initial) : undefined;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const titleId = "composer-title";
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="composer" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()}><div className="composer-heading"><div><small>{initial ? "به‌روزرسانی برنامه" : "یک قدم تازه"}</small><h2 id={titleId}>{initial ? category === "meeting" ? "ویرایش جلسه" : "ویرایش کار" : category === "meeting" ? "جلسه جدید" : "کار جدید"}</h2></div><button type="button" onClick={onClose}>بستن</button></div><label>عنوان<input name="title" autoFocus required defaultValue={initial?.title} placeholder={category === "meeting" ? "مثلاً جلسه با تیم فروش" : "مثلاً تماس با تیم فروش"} /></label><div className="field-grid"><label>دسته‌بندی<select name="category" value={category} onChange={(event) => setCategory(event.target.value as Category)}>{initial?.source === "meeting" ? <option value="meeting">جلسه</option> : <><option value="personal">شخصی</option><option value="work">شرکتی</option>{!initial && <option value="meeting">جلسه</option>}</>}</select></label><label>اولویت<select name="priority" disabled={category === "meeting"} defaultValue={initial?.priority || "normal"}><option value="normal">عادی</option><option value="important">مهم</option><option value="urgent">فوری</option></select></label></div><div className="field-grid"><label>{category === "meeting" ? "تاریخ" : "تاریخ (اختیاری)"}<PersianDateField name="date" defaultValue={moment ? dateKey(moment) : initialDate || (initial ? "" : localDateInput())} required={category === "meeting"} /></label><label>ساعت<Time24Field name="time" defaultValue={localTimeInput(moment)} required={category === "meeting"} /></label></div><div className="composer-reminder-summary"><strong>یادآوری‌های فعال</strong><span>{reminderOffsetsLabel(defaultReminderOffsets)}</span><small>از بخش تنظیمات برنامه‌ریزی قابل تغییر است.</small></div><button className="submit-button">{initial ? "ذخیره تغییرات" : "ثبت در برنامه"}</button></form></div>;
}

function Nav({ active, label, badge, onClick }: { active: boolean; label: string; badge?: number; onClick: () => void }) { return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{label}{badge !== undefined && <small>{badge}</small>}</button>; }
function Assistant(props: { onAdd: () => void; onChanged: () => Promise<void> }) { return <AgentAssistant {...props} />; }

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
