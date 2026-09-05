export const DEFAULT_REMINDER_OFFSETS = [1440, 180, 60] as const;

export const REMINDER_OFFSET_OPTIONS = [
  { minutes: 1440, label: "۱ روز قبل" },
  { minutes: 180, label: "۳ ساعت قبل" },
  { minutes: 60, label: "۱ ساعت قبل" },
] as const;

const MAX_REMINDER_OFFSET = 10_080;

export function normalizeReminderOffsets(values: readonly number[] | null | undefined, legacyMinutes?: number) {
  const candidates = values?.length ? values : legacyMinutes !== undefined ? [legacyMinutes] : DEFAULT_REMINDER_OFFSETS;
  return [...new Set(candidates)]
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= MAX_REMINDER_OFFSET)
    .sort((left, right) => right - left)
    .slice(0, 3);
}

export function parseStoredReminderOffsets(value: string | null | undefined, legacyMinutes?: number) {
  const parsed = value?.split(",").map(Number).filter(Number.isFinite);
  const normalized = normalizeReminderOffsets(parsed, legacyMinutes);
  return normalized.length ? normalized : [...DEFAULT_REMINDER_OFFSETS];
}

export function serializeReminderOffsets(values: readonly number[]) {
  return normalizeReminderOffsets(values).join(",");
}

export function buildReminderSchedule(reference: Date, offsets: readonly number[]) {
  return normalizeReminderOffsets(offsets).map((minutes) => ({
    minutes,
    scheduledFor: new Date(reference.getTime() - minutes * 60_000),
  }));
}
