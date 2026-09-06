import { describe, expect, it } from "vitest";
import { formatAgentContext } from "./agent-context";

describe("agent context", () => {
  it("includes planning preferences and upcoming schedule", () => {
    const preference = { workdayStartsAt: "08:30", workdayEndsAt: "17:30", workingDays: "SAT,SUN", defaultReminderMins: 60, defaultReminderOffsets: "1440,180,60", quietHoursStartsAt: "22:00", quietHoursEndsAt: "08:00", planningProfile: "FOCUS" };
    const context = formatAgentContext({
      preference,
      tasks: [{ title: "ارسال گزارش", category: "WORK", priority: "IMPORTANT", dueAt: new Date("2026-09-01T08:00:00.000Z") }],
      meetings: [{ title: "جلسه محصول", startsAt: new Date("2026-09-01T09:00:00.000Z"), endsAt: new Date("2026-09-01T10:00:00.000Z") }],
    });
    expect(context).not.toContain("planningProfile");
    expect(context).not.toContain("FOCUS");
    expect(context).toContain("ارسال گزارش");
    expect(context).toContain("جلسه محصول");
    expect(context).toContain('\"defaultReminderMinutes\":[1440,180,60]');
  });

  it("supports a new user without preferences", () => {
    expect(formatAgentContext({ preference: null, tasks: [], meetings: [] })).toContain('"planning":null');
  });
});
