import { describe, expect, it } from "vitest";
import { z } from "zod";
import { modelPlanSchema, planSchema } from "./agent-plan-schema";
import { planPersian } from "./agent-planner";
import { readAlertPolicy } from "./alert-policy";

describe("strict model plan contract", () => {
  it("requires every field without defaults in input JSON Schema", () => {
    const schema = z.toJSONSchema(modelPlanSchema, { io: "input", target: "draft-7" });
    expect(schema.required?.sort()).toEqual(Object.keys(schema.properties ?? {}).sort());
    expect(schema.additionalProperties).toBe(false);
    expect(JSON.stringify(schema)).not.toContain('"default"');
  });
  it("still reads stored drafts created before the new fields", () => {
    const plan = planPersian("فردا ساعت 17 گزارش بساز", { timezone: "Asia/Tehran" }).plan!;
    const legacy = { ...plan, ambiguousTime: undefined, occurrenceCount: undefined };
    expect(planSchema.parse(legacy)).toMatchObject({ ambiguousTime: null, occurrenceCount: null });
  });
  it("retains zero across model, stored draft and persisted alert policy", () => {
    const plan = { ...planPersian("فردا ساعت 17 گزارش بساز").plan!, repeatCount: 0, escalation: true };
    for (const schema of [planSchema, modelPlanSchema]) expect(schema.parse(plan).repeatCount).toBe(0);
    expect(readAlertPolicy(JSON.stringify(plan))?.repeatCount).toBe(0);
    expect(z.toJSONSchema(modelPlanSchema, { io: "input" }).properties?.repeatCount).toMatchObject({ minimum: 0, maximum: 6 });
  });
  it.each([-1, 0.5, 7, "0", null])("rejects invalid repeat count %j in every contract", repeatCount => {
    const plan = { ...planPersian("فردا ساعت 17 گزارش بساز").plan!, repeatCount };
    expect(planSchema.safeParse(plan).success).toBe(false);
    expect(modelPlanSchema.safeParse(plan).success).toBe(false);
    expect(readAlertPolicy(JSON.stringify(plan))).toBeNull();
  });
});
