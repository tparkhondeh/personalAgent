import { describe, expect, it } from "vitest";
import { isInsideQuietHours, nextRecurrence, reminderIdempotencyKey } from "./reminders";

describe("reminder utilities", () => {
  it("creates a stable idempotency key", () => {
    const date = new Date("2026-08-30T10:00:00.000Z");
    expect(reminderIdempotencyKey("user-1", "task-1", date, "PUSH")).toBe("user-1:task-1:2026-08-30T10:00:00.000Z:PUSH");
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
});
