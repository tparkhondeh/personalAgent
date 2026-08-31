import { describe, expect, it } from "vitest";
import { buildEscalationPlan, defaultEscalationPolicy, escalationIdempotencyKey, isUrgentOverdueTask, nativeNotificationId } from "./escalations";

describe("urgent escalation planning", () => {
  const anchor = new Date("2026-08-31T10:00:00.000Z");

  it("creates immediate notice, bounded Android repeats and a high-priority fallback", () => {
    const plan = buildEscalationPlan(anchor, defaultEscalationPolicy);
    expect(plan.map((entry) => entry.level)).toEqual(["IN_APP_PUSH", "ANDROID_ALARM", "ANDROID_ALARM", "ANDROID_ALARM", "HIGH_PRIORITY"]);
    expect(plan[1].scheduledFor.toISOString()).toBe("2026-08-31T10:15:00.000Z");
    expect(plan.at(-1)?.scheduledFor.toISOString()).toBe("2026-08-31T11:00:00.000Z");
  });

  it("keeps paid channels as explicit mock stages", () => {
    const plan = buildEscalationPlan(anchor, { ...defaultEscalationPolicy, smsEscalationEnabled: true, callEscalationEnabled: true });
    expect(plan.slice(-2).map((entry) => [entry.level, entry.provider])).toEqual([["SMS_MOCK", "MOCK"], ["CALL_MOCK", "MOCK"]]);
  });

  it("produces stable unique keys and Android-safe numeric identifiers", () => {
    const entry = buildEscalationPlan(anchor, defaultEscalationPolicy)[0];
    expect(escalationIdempotencyKey("u1", "t1", anchor, entry)).toBe("u1:t1:2026-08-31T10:00:00.000Z:IN_APP_PUSH:1");
    expect(nativeNotificationId("attempt-1")).toBe(nativeNotificationId("attempt-1"));
    expect(nativeNotificationId("attempt-1")).toBeGreaterThan(0);
  });

  it("only escalates open urgent tasks after their deadline", () => {
    expect(isUrgentOverdueTask({ priority: "URGENT", status: "TODO", dueAt: "2026-08-31T09:59:00.000Z" }, anchor)).toBe(true);
    expect(isUrgentOverdueTask({ priority: "IMPORTANT", status: "TODO", dueAt: "2026-08-31T09:59:00.000Z" }, anchor)).toBe(false);
    expect(isUrgentOverdueTask({ priority: "URGENT", status: "DONE", dueAt: "2026-08-31T09:59:00.000Z" }, anchor)).toBe(false);
  });
});
