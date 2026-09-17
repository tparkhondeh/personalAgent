import { tehranDayKey } from "./dashboard-overview";

// A noon-UTC date is an arithmetic carrier for a Tehran calendar day, not an event instant.
export function tehranWeek(now: Date, offset = 0): Date[] {
  const day = new Date(`${tehranDayKey(now)}T12:00:00Z`);
  const start = day.getUTCDate() - (day.getUTCDay() + 1) % 7 + offset * 7;
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(day);
    date.setUTCDate(start + index);
    return date;
  });
}

export function manualItemMoment(item: { source: "task" | "meeting"; startsAt?: string; dueAt?: string }): string | undefined {
  return item.source === "meeting" ? item.startsAt : item.dueAt;
}
