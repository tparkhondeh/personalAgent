import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import data from "@/data/rumi-daily.json";
import { getDailyRumiSelection } from "./daily-rumi";

type OfflineTask = { deadline?: string; done?: boolean; reminderOffsets?: number[]; notificationId?: number; notificationIds?: number[] };
const context = { window: {} };
runInNewContext(readFileSync("mobile-shell/domain.js", "utf8"), context);
const domain = (context.window as { HamrahOffline: {
  dailyPoem: (poems: string[][], date: Date) => string[];
  normalizeOffsets: (value: unknown) => number[];
  reminderTimes: (task: OfflineTask, now: number) => number[];
  notificationIds: (task: OfflineTask) => number[];
  localDateInput: (date: Date) => string;
  persianMonth: (date: Date) => { first: Date; days: { day: number; date: Date }[] };
} }).HamrahOffline;

describe("web and bundled Android parity", () => {
  it("selects the exact same poem across the Tehran day boundary", () => {
    for (const date of ["2026-09-05T20:29:59Z", "2026-09-05T20:30:00Z", "2025-01-01T00:00:00Z"]) {
      expect(domain.dailyPoem(data.selections.map((poem) => poem.lines), new Date(date))).toEqual(getDailyRumiSelection(new Date(date)).lines);
    }
  });
  it("schedules three distinct future reminders and skips elapsed ones", () => {
    const deadline = "2026-09-10T12:00:00Z";
    const at = new Date(deadline).getTime();
    expect(domain.reminderTimes({ deadline, reminderOffsets: [1440, 180, 60, 60] }, at - 2 * 86400000)).toEqual([at - 86400000, at - 10800000, at - 3600000]);
    expect(domain.reminderTimes({ deadline }, at - 7200000)).toEqual([at - 3600000]);
    expect(domain.reminderTimes({ deadline }, at)).toEqual([]);
    expect(domain.reminderTimes({ deadline, done: true }, 0)).toEqual([]);
  });
  it("retains legacy notification IDs for cancellation after upgrade", () => {
    expect(domain.notificationIds({ notificationId: 7, notificationIds: [7, 8, 9] })).toEqual([7, 8, 9]);
    expect(domain.normalizeOffsets([180, 180, -1, 999])).toEqual([180]);
  });
  it("uses Persian month days instead of Gregorian days under a Persian title", () => {
    const month = domain.persianMonth(new Date(2026, 8, 6, 12));
    expect(month.days).toHaveLength(31);
    expect(month.first.getMonth()).toBe(7);
    expect(month.first.getDate()).toBe(23);
    expect(month.days.at(-1)?.date.getDate()).toBe(22);
  });
  it("round-trips the local datetime input without UTC hour drift", () => {
    const date = new Date(2026, 8, 10, 15, 30);
    expect(domain.localDateInput(date)).toBe("2026-09-10T15:30");
  });
  it("ships the complete data and valid embedded runtime, without fetching it", () => {
    const content = readFileSync("mobile-shell/content.js", "utf8");
    const recovery = readFileSync("mobile-shell/connection-error.html", "utf8");
    const scriptLiteral = recovery.match(/const bundledScript = (.*); \/\/ generated-offline-script/)?.[1];
    expect(scriptLiteral).toBeTruthy();
    const runtime = JSON.parse(scriptLiteral!);
    expect(runtime).toContain(content.trim());
    expect(runtime).toContain(readFileSync("mobile-shell/domain.js", "utf8").trim());
    expect(runtime).toContain(readFileSync("mobile-shell/app.js", "utf8").trim());
    expect(() => new Function(runtime)).not.toThrow();
    const contentContext = { window: { HamrahPoems: [] as string[][] } };
    runInNewContext(content, contentContext);
    expect(contentContext.window.HamrahPoems).toEqual(data.selections.map((poem) => poem.lines));
  });
});
