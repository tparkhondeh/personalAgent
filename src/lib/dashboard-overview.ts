// Shared by React and the generated, network-independent Android interface.
export type OverviewItem = {
  id: string; source?: string; category: string; startsAt?: string; dueAt?: string;
  deadline?: string; done?: boolean; archived?: boolean;
};
export const dashboardGroups = [
  { key: "all", label: "ALL TASKS", name: "مجموع برنامه‌ها" },
  { key: "personal", label: "PERSONAL", name: "شخصی" },
  { key: "work", label: "BUSINESS", name: "شرکتی" },
  { key: "meeting", label: "MEETING", name: "جلسات" },
] as const;
export function tehranDayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function overviewCategory(item: OverviewItem) {
  if (item.source === "meeting" || item.category === "meeting") return "meeting";
  return item.category === "work" || item.category === "company" ? "work" : "personal";
}
export function selectDashboardItems<T extends OverviewItem>(items: T[], view: string, filter = "all", now = new Date()): T[] {
  const today = tehranDayKey(now), seen = new Set<string>();
  return items.filter(item => {
    const category = overviewCategory(item), key = `${category === "meeting" ? "meeting" : "task"}:${item.id}`;
    if (item.archived || seen.has(key)) return false;
    seen.add(key);
    if (filter !== "all" && category !== (filter === "company" ? "work" : filter)) return false;
    if (view !== "today") return true;
    const moment = item.startsAt || item.dueAt || item.deadline;
    return Boolean(moment && Number.isFinite(Date.parse(moment)) && tehranDayKey(new Date(moment)) === today);
  });
}
export function summarizeDashboardItems(items: OverviewItem[]) {
  const unique = selectDashboardItems(items, "tasks");
  return dashboardGroups.map(group => {
    const selected = group.key === "all" ? unique : unique.filter(item => overviewCategory(item) === group.key);
    return { ...group, total: selected.length, done: selected.filter(item => item.done).length };
  });
}
export function dailyPoemIndex(length: number, now = new Date()) {
  if (!Number.isInteger(length) || length < 1) throw new Error("Empty poem collection");
  const day = Math.floor(Date.parse(tehranDayKey(now) + "T00:00:00Z") / 86400000);
  const elapsed = day - Math.floor(Date.UTC(2026, 0, 1) / 86400000);
  return ((elapsed % length) + length) % length;
}
export const poemPreferenceKey = "hamrah.poem.v1";
export function createPoemNavigator(length: number, storage?: Pick<Storage, "getItem" | "setItem">, now = () => new Date()) {
  let memory: { day: string; index: number } | undefined;
  function current() {
    const date = now(), day = tehranDayKey(date);
    try {
      const saved = JSON.parse(storage?.getItem(poemPreferenceKey) || "null");
      if (saved?.day === day && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < length) memory = saved;
    } catch { /* Storage can be unavailable; keep the current in-memory choice. */ }
    if (memory?.day !== day) memory = { day, index: dailyPoemIndex(length, date) };
    return memory!.index;
  }
  return {
    current,
    next() {
      const index = (current() + 1) % length;
      memory = { day: tehranDayKey(now()), index };
      try { storage?.setItem(poemPreferenceKey, JSON.stringify(memory)); } catch { /* Non-essential preference. */ }
      return index;
    },
  };
}
