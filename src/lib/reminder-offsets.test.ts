import { describe, expect, it } from "vitest";
import { buildReminderSchedule, normalizeReminderOffsets, parseStoredReminderOffsets, serializeReminderOffsets } from "./reminder-offsets";

describe("multiple default reminders", () => {
  it("keeps at most three unique offsets in chronological display order", () => {
    expect(normalizeReminderOffsets([60, 1440, 180, 60])).toEqual([1440, 180, 60]);
  });

  it("supports old preferences that only stored one reminder", () => {
    expect(parseStoredReminderOffsets(undefined, 30)).toEqual([30]);
    expect(serializeReminderOffsets([1440, 180, 60])).toBe("1440,180,60");
  });

  it("builds three independent reminder times", () => {
    const dueAt = new Date("2026-09-10T12:00:00.000Z");
    const schedule = buildReminderSchedule(dueAt, [1440, 180, 60]);
    expect(schedule.map((entry) => entry.scheduledFor.toISOString())).toEqual([
      "2026-09-09T12:00:00.000Z",
      "2026-09-10T09:00:00.000Z",
      "2026-09-10T11:00:00.000Z",
    ]);
  });
});
