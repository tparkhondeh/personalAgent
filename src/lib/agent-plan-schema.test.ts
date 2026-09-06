import { describe, expect, it } from "vitest";
import { z } from "zod";
import { modelPlanSchema, planSchema } from "./agent-plan-schema";
import { planPersian } from "./agent-planner";

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
});
