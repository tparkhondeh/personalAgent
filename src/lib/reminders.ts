import { RRule } from "rrule";

export function reminderIdempotencyKey(userId: string, entityId: string, scheduledFor: Date, channel: string) {
  return `${userId}:${entityId}:${scheduledFor.toISOString()}:${channel}`;
}

export function nextRecurrence(rule: string, after: Date) {
  const parsed = RRule.fromString(rule);
  return parsed.after(after, false);
}

export function isInsideQuietHours(now: Date, start: string, end: string, timezone = "Asia/Tehran") {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const current = hour * 60 + minute;
  const toMinutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
  const startMinutes = toMinutes(start); const endMinutes = toMinutes(end);
  return startMinutes > endMinutes ? current >= startMinutes || current < endMinutes : current >= startMinutes && current < endMinutes;
}

export function moveOutsideQuietHours(date: Date, start: string, end: string, timezone = "Asia/Tehran") {
  const candidate = new Date(date);
  for (let quarterHour = 0; quarterHour < 96 && isInsideQuietHours(candidate, start, end, timezone); quarterHour++) {
    candidate.setTime(candidate.getTime() + 15 * 60_000);
  }
  return candidate;
}
