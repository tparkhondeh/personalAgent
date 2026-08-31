import { describe, expect, it } from "vitest";
import { meetingInputSchema, taskInputSchema } from "./validation";

describe("input validation", () => {
  it("rejects an empty task title", () => {
    expect(taskInputSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("accepts a valid work task", () => {
    expect(taskInputSchema.safeParse({ title: "ارسال گزارش", category: "WORK", priority: "IMPORTANT" }).success).toBe(true);
  });

  it("rejects meetings ending before they start", () => {
    const result = meetingInputSchema.safeParse({ title: "جلسه", startsAt: "2026-08-30T12:00:00.000Z", endsAt: "2026-08-30T11:00:00.000Z" });
    expect(result.success).toBe(false);
  });
});
