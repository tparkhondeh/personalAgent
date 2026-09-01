import { describe, expect, it } from "vitest";
import { isInsideQuietHours, moveOutsideQuietHours, nextRecurrence, reminderIdempotencyKey, shouldScheduleTaskReminder } from "./reminders";

describe("reminder utilities", () => {
  it("creates a stable idempotency key", () => {
    const date = new Date("2026-08-30T10:00:00.000Z");
    expect(reminderIdempotencyKey("user-1", "task-1", date, "PUSH")).toBe("user-1:task-1:2026-08-30T10:00:00.000Z:PUSH");
  });

  it("moves strong alerts to the end of quiet hours", () => {
    const moved = moveOutsideQuietHours(new Date("2026-08-31T23:00:00.000Z"), "22:00", "08:00", "UTC");
    expect(moved.toISOString()).toBe("2026-09-01T08:00:00.000Z");
  });

  it("recognizes quiet hours that cross midnight", () => {
    expect(isInsideQuietHours(new Date("2026-08-30T20:00:00.000Z"), "22:00", "08:00", "UTC")).toBe(false);
    expect(isInsideQuietHours(new Date("2026-08-30T23:00:00.000Z"), "22:00", "08:00", "UTC")).toBe(true);
    expect(isInsideQuietHours(new Date("2026-08-30T05:00:00.000Z"), "22:00", "08:00", "UTC")).toBe(true);
  });

  it("calculates the next recurring occurrence", () => {
    const next = nextRecurrence("DTSTART:20260830T090000Z\nRRULE:FREQ=DAILY;COUNT=3", new Date("2026-08-30T10:00:00Z"));
    expect(next?.toISOString()).toBe("2026-08-31T09:00:00.000Z");
  });

  it("keeps reminders only for open tasks that have a deadline", () => {
    const dueAt = new Date("2026-09-01T08:00:00.000Z");
    expect(shouldScheduleTaskReminder({ status: "TODO", dueAt })).toBe(true);
    expect(shouldScheduleTaskReminder({ status: "IN_PROGRESS", dueAt })).toBe(true);
    expect(shouldScheduleTaskReminder({ status: "DONE", dueAt })).toBe(false);
    expect(shouldScheduleTaskReminder({ status: "CANCELLED", dueAt })).toBe(false);
    expect(shouldScheduleTaskReminder({ status: "TODO", dueAt: null })).toBe(false);
  });
});
