import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText, Output } from "ai";
import { z } from "zod";
import { modelPlanSchema } from "./agent-plan-schema";
import { planPersian } from "./agent-planner";
vi.mock("server-only", () => ({}));
import { boundedOpenAiFetch, getLanguageModel, MAX_AGENT_REQUEST_BYTES } from "./agent";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("real installed SDK wire contract (synthetic transport, no paid requests)", () => {
  it("uses Responses strict structured output without storing text or using tools", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-key-not-valid");
    vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");
    const output = { reply: "پیشنهاد آماده است", plan: planPersian("فردا ساعت پنج عصر جلسه با تیم فروش دارم").plan, questions: [] };
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      id: "resp_synthetic", object: "response", created_at: 1, model: "gpt-5-mini", status: "completed",
      output: [{ type: "message", id: "msg_synthetic", status: "completed", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }));
    const result = await generateText({
      model: getLanguageModel(), prompt: "synthetic only",
      output: Output.object({ schema: z.object({ reply: z.string(), plan: modelPlanSchema.nullable(), questions: z.array(z.string()) }) }),
      maxOutputTokens: 2200, maxRetries: 0,
      providerOptions: { openai: { store: false, serviceTier: "default", reasoningEffort: "low" } },
    });
    expect(result.output).toEqual(output);
    expect(network).toHaveBeenCalledOnce();
    const [url, init] = network.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    const wire = JSON.parse(init!.body as string);
    expect(wire).toMatchObject({ model: "gpt-5-mini", store: false, service_tier: "default", max_output_tokens: 2200, reasoning: { effort: "low" }, text: { format: { type: "json_schema", strict: true } } });
    expect(wire.tools ?? []).toEqual([]);
    expect(wire.text.format.schema.properties.plan.anyOf[0].required).toContain("ambiguousTime");
    expect(new TextEncoder().encode(init!.body as string).length).toBeLessThan(MAX_AGENT_REQUEST_BYTES);
    expect(JSON.stringify(wire)).not.toContain("synthetic-key-not-valid");
  });
  it.each(["الف".repeat(32_000), "x".repeat(MAX_AGENT_REQUEST_BYTES + 1), new Blob(["wrong-body"]), undefined])("rejects oversized/unknown bodies before transmission", async body => {
    const network = vi.spyOn(globalThis, "fetch");
    await expect(boundedOpenAiFetch("https://api.openai.com/v1/responses", { method: "POST", body })).rejects.toMatchObject({ name: "TiaContextLimitError" });
    expect(network).not.toHaveBeenCalled();
  });
});
