import { afterEach, describe, expect, it, vi } from "vitest";
import { tehranDayKey } from "./dashboard-overview";
import { manualItemMoment, tehranWeek } from "./web-calendar";

afterEach(() => vi.unstubAllEnvs());
describe("Tehran weeks regardless of device timezone", () => {
  it.each(["Asia/Tehran", "America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati"])("includes Tehran Saturday even on a %s device", zone => {
    vi.stubEnv("TZ", zone);
    expect(tehranWeek(new Date("2026-09-18T21:30:00Z")).map(tehranDayKey)).toEqual([
      "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25",
    ]);
  });
  it("keeps Friday in its week until Tehran midnight", () => {
    expect(tehranWeek(new Date("2026-09-18T20:29:59Z")).map(tehranDayKey)).toContain("2026-09-18");
    expect(tehranDayKey(tehranWeek(new Date("2026-09-18T20:30:00Z"))[0])).toBe("2026-09-19");
  });
  it("navigates weeks through a year boundary with Saturday first", () => {
    const now = new Date("2027-01-01T22:00:00Z");
    expect(tehranDayKey(tehranWeek(now, -1)[0])).toBe("2026-12-26");
    expect(tehranDayKey(tehranWeek(now, 0)[0])).toBe("2027-01-02");
    expect(tehranDayKey(tehranWeek(now, 1)[0])).toBe("2027-01-09");
  });
});

describe("manual date field meaning", () => {
  it("edits a task deadline independently of its earlier start", () => {
    expect(manualItemMoment({ source: "task", startsAt: "2026-09-18T05:30:00Z", dueAt: "2026-09-18T14:30:00Z" })).toBe("2026-09-18T14:30:00Z");
  });
  it("does not invent a deadline for a task with only a start", () => {
    expect(manualItemMoment({ source: "task", startsAt: "2026-09-18T05:30:00Z" })).toBeUndefined();
  });
  it("continues editing the meeting start", () => {
    expect(manualItemMoment({ source: "meeting", startsAt: "2026-09-18T05:30:00Z" })).toBe("2026-09-18T05:30:00Z");
  });
});
