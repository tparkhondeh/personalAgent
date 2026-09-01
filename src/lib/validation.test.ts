import { describe, expect, it } from "vitest";
import { escalationAcknowledgeSchema, meetingInputSchema, meetingUpdateSchema, notificationReadSchema, taskInputSchema, taskUpdateSchema, userPreferenceInputSchema } from "./validation";

describe("input validation", () => {
  it("rejects an empty task title", () => {
    expect(taskInputSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("accepts a valid work task", () => {
    expect(taskInputSchema.safeParse({ title: "ارسال گزارش", category: "WORK", priority: "IMPORTANT" }).success).toBe(true);
  });

  it("allows removing a task deadline during editing", () => {
    const result = taskUpdateSchema.safeParse({ dueAt: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dueAt).toBeNull();
  });

  it("rejects meetings ending before they start", () => {
    const result = meetingInputSchema.safeParse({ title: "جلسه", startsAt: "2026-08-30T12:00:00.000Z", endsAt: "2026-08-30T11:00:00.000Z" });
    expect(result.success).toBe(false);
  });

  it("accepts a partial meeting update", () => {
    const result = meetingUpdateSchema.safeParse({ title: "جلسه هفتگی" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ title: "جلسه هفتگی" });
  });

  it("rejects invalid times in a meeting update", () => {
    const result = meetingUpdateSchema.safeParse({ startsAt: "2026-08-30T12:00:00.000Z", endsAt: "2026-08-30T11:00:00.000Z" });
    expect(result.success).toBe(false);
  });

  it("accepts a complete personal planning profile", () => {
    const result = userPreferenceInputSchema.safeParse({ timezone: "Asia/Tehran", locale: "fa-IR", workdayStartsAt: "09:00", workdayEndsAt: "18:00", workingDays: ["SAT", "SUN", "MON", "TUE", "WED"], defaultReminderMins: 15, quietHoursStartsAt: "22:00", quietHoursEndsAt: "08:00", planningProfile: "BALANCED" });
    expect(result.success).toBe(true);
  });

  it("rejects a profile without a working day", () => {
    const result = userPreferenceInputSchema.safeParse({ workdayStartsAt: "09:00", workdayEndsAt: "18:00", workingDays: [], defaultReminderMins: 15, quietHoursStartsAt: "22:00", quietHoursEndsAt: "08:00", planningProfile: "BALANCED" });
    expect(result.success).toBe(false);
  });

  it("accepts a local emergency contact and rejects arbitrary phone text", () => {
    const base = { workdayStartsAt: "09:00", workdayEndsAt: "18:00", workingDays: ["SAT"], defaultReminderMins: 15, quietHoursStartsAt: "22:00", quietHoursEndsAt: "08:00", planningProfile: "BALANCED" };
    expect(userPreferenceInputSchema.safeParse({ ...base, emergencyContactName: "خانواده", emergencyPhone: "+98 912 000 0000" }).success).toBe(true);
    expect(userPreferenceInputSchema.safeParse({ ...base, emergencyPhone: "not-a-phone" }).success).toBe(false);
  });

  it("limits Android alarm acknowledgement batches", () => {
    expect(escalationAcknowledgeSchema.safeParse({ attemptIds: ["a1", "a2"] }).success).toBe(true);
    expect(escalationAcknowledgeSchema.safeParse({ attemptIds: [] }).success).toBe(false);
  });

  it("allows reading one notification or all, but not both", () => {
    expect(notificationReadSchema.safeParse({ id: "notice-1" }).success).toBe(true);
    expect(notificationReadSchema.safeParse({ all: true }).success).toBe(true);
    expect(notificationReadSchema.safeParse({ id: "notice-1", all: true }).success).toBe(false);
  });
});
