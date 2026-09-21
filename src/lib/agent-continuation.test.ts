import { describe, expect, it } from "vitest";
import { planPersian, type Plan } from "./agent-planner";
import { reviewModelContinuation } from "./agent-continuation";

describe("pending proposal identity is not an existing item", () => {
  const previous = planPersian("فردا ساعت پنج عصر جلسه با تیم فروش دارم").plan!;
  const candidate: Plan = { ...previous, operation: "UPDATE", title: "جلسه هماهنگی تیم فروش", time: "18:00" };
  it("preserves corrected details without mutating the previous or provider plan", () => {
    const result = reviewModelContinuation(candidate, previous, previous);
    expect(result).toEqual({ ...candidate, operation: "CREATE", targetUpdatedAt: null });
    expect(candidate.operation).toBe("UPDATE"); expect(previous.time).toBe("17:00");
  });
  it.each(["DELETE", "COMPLETE", "UPDATE"] as const)("does not reinterpret explicit local %s intent", operation => {
    expect(reviewModelContinuation(candidate, previous, { ...previous, operation })).toBe(candidate);
  });
  it("never guesses an existing target, new entity or missing prior", () => {
    const targeted = { ...candidate, targetId: "owned-existing" };
    expect(reviewModelContinuation(targeted, previous, previous)).toBe(targeted);
    expect(reviewModelContinuation(candidate, null, previous)).toBe(candidate);
    expect(reviewModelContinuation(candidate, previous, null)).toBe(candidate);
    const otherEntity: Plan = { ...candidate, entity: "TASK" };
    expect(reviewModelContinuation(otherEntity, previous, previous)).toBe(otherEntity);
    expect(reviewModelContinuation(null, previous, previous)).toBeNull();
    expect(reviewModelContinuation(candidate, { ...previous, operation: "UPDATE" }, previous)).toBe(candidate);
  });
});
