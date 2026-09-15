import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateText, Output } from "ai";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { recordSyntheticUsage, reserveSyntheticTest, syntheticTestPolicy, TEST_RESERVATION_MICRO_USD, TEST_TOTAL_MICRO_USD } from "./ai-test-policy";
import { boundedOpenAiFetch, getLanguageModel } from "./agent";
import { providerFailure } from "./agent-provider-status";

let dir: string;
const endpoint = "https://api.openai.com/v1/responses";
const wire = (extra: Record<string, unknown> = {}) => JSON.stringify({ model: "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: "synthetic" }] }], store: false, service_tier: "default", max_output_tokens: 2200, ...extra });
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "tia-synthetic-budget-"));
  vi.stubEnv("OPENAI_TEST_USER_ID", "synthetic-owner");
  vi.stubEnv("OPENAI_TEST_LEDGER_DIR", dir);
  vi.stubEnv("OPENAI_TEST_EXPIRES_AT", new Date(Date.now() + 600000).toISOString());
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  // Only this test's exclusive scratch directory, never a live ledger.
  if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith("tia-synthetic-budget-")) throw new Error("Unsafe scratch path");
  await rm(dir, { recursive: true });
});

describe("one-off synthetic allowance, no real network", () => {
  it("only authorizes the exact synthetic owner; partial or expired configuration fails closed", () => {
    expect(syntheticTestPolicy("synthetic-owner").allowed).toBe(true);
    expect(syntheticTestPolicy("real-user").allowed).toBe(false);
    expect(syntheticTestPolicy().allowed).toBe(false);
    vi.stubEnv("OPENAI_TEST_EXPIRES_AT", "bad-date");
    expect(syntheticTestPolicy("synthetic-owner").allowed).toBe(false);
    vi.stubEnv("OPENAI_TEST_EXPIRES_AT", "2020-01-01T00:00:00Z");
    expect(syntheticTestPolicy("synthetic-owner").allowed).toBe(false);
  });
  it("requires an existing private ledger outside the web workspace", async () => {
    vi.stubEnv("OPENAI_TEST_LEDGER_DIR", path.resolve("public/ledger"));
    expect(syntheticTestPolicy("synthetic-owner").allowed).toBe(false);
    await expect(reserveSyntheticTest(endpoint, wire())).rejects.toMatchObject({ name: "TiaTestBudgetError" });
    vi.stubEnv("OPENAI_TEST_LEDGER_DIR", path.join(dir, "does-not-exist"));
    await expect(reserveSyntheticTest(endpoint, wire())).rejects.toMatchObject({ name: "TiaTestBudgetError" });
  });
  it("uses exclusive durable reservations across concurrent callers and restarts without refunds", async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 18 }, () => reserveSyntheticTest(endpoint, wire())));
    const accepted = attempts.filter(r => r.status === "fulfilled");
    expect(accepted).toHaveLength(TEST_TOTAL_MICRO_USD / TEST_RESERVATION_MICRO_USD);
    expect((await readdir(dir)).filter(name => name.startsWith("reservation-"))).toHaveLength(10);
    await expect(reserveSyntheticTest(endpoint, wire())).rejects.toMatchObject({ name: "TiaTestBudgetError" });
    const saved = JSON.parse(await readFile(path.join(dir, "reservation-1.json"), "utf8"));
    expect(saved.maximumEstimateMicroUsd).toBeLessThan(saved.reservedMicroUsd);
    expect(10 * saved.reservedMicroUsd).toBe(250000);
  });
  it.each([
    { model: "other-model" }, { max_output_tokens: 2201 }, { max_output_tokens: 0 },
    { service_tier: "priority" }, { store: true }, { stream: true }, { background: true },
    { previous_response_id: "unknown-context" }, { conversation: "unknown-context" },
    { tools: [{ type: "web_search" }] }, { input: [{ role: "user", content: [{ type: "input_image", image_url: "https://example.invalid" }] }] },
  ])("rejects unpriced/unsupported inputs before reserving: %j", async extra => {
    await expect(reserveSyntheticTest(endpoint, wire(extra))).rejects.toMatchObject({ name: "TiaTestBudgetError" });
    expect(await readdir(dir)).toEqual([]);
  });
  it("rejects wrong destination and malformed JSON before egress", async () => {
    await expect(reserveSyntheticTest("https://other.invalid/", wire())).rejects.toMatchObject({ name: "TiaTestBudgetError" });
    await expect(reserveSyntheticTest(endpoint, "not-json")).rejects.toMatchObject({ name: "TiaTestBudgetError" });
    await expect(reserveSyntheticTest(endpoint, "null")).rejects.toMatchObject({ name: "TiaTestBudgetError" });
    expect(await readdir(dir)).toEqual([]);
  });
  it("writes only numeric usage evidence and never body/secret text", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ output: "private-provider-body", usage: { input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 200 } } }));
    const response = await boundedOpenAiFetch(endpoint, { body: wire(), headers: { Authorization: "Bearer private-test-credential" } });
    expect(response.ok).toBe(true); expect(network).toHaveBeenCalledOnce();
    const evidence = await readFile(path.join(dir, "usage-1.json"), "utf8");
    expect(JSON.parse(evidence)).toMatchObject({ usageVerified: true, inputTokens: 1000, outputTokens: 500, cachedInputTokens: 200, estimatedMicroUsd: 1205 });
    expect(evidence).not.toContain("private-");
    // The SDK can still consume its response after evidence capture.
    expect((await response.json()).output).toBe("private-provider-body");
  });
  it("keeps allowance on uncertain network errors without exposing error details", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("private-failure"));
    await expect(boundedOpenAiFetch(endpoint, { body: wire() })).rejects.toThrow("private-failure");
    const evidence = await readFile(path.join(dir, "usage-1.json"), "utf8");
    expect(JSON.parse(evidence)).toMatchObject({ status: null, usageVerified: false, reservedMicroUsd: 25000 });
    expect(evidence).not.toContain("private-failure");
    expect((await reserveSyntheticTest(endpoint, wire()))?.slot).toBe(2);
  });
  it("stops later requests if observed usage exceeds reservation assumptions", async () => {
    const reservation = await reserveSyntheticTest(endpoint, wire());
    await recordSyntheticUsage(reservation, Response.json({ usage: { input_tokens: 1_000_000, output_tokens: 500 } }));
    expect(await readdir(dir)).toContain("HALT.json");
    const network = vi.spyOn(globalThis, "fetch");
    await expect(boundedOpenAiFetch(endpoint, { body: wire() })).rejects.toMatchObject({ name: "TiaTestBudgetError" });
    expect(network).not.toHaveBeenCalled();
  });
  it("treats a partial reservation file as consumed, never as available", async () => {
    await writeFile(path.join(dir, "reservation-1.json"), "partial", { flag: "wx" });
    expect((await reserveSyntheticTest(endpoint, wire()))?.slot).toBe(2);
  });
  it("accepts the real SDK structured-response wire and records synthetic usage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-valid-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-mini"); vi.stubEnv("AI_PROVIDER", "openai");
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      id: "resp_synthetic", object: "response", created_at: 1, model: "gpt-5-mini", status: "completed",
      output: [{ type: "message", id: "msg_synthetic", status: "completed", role: "assistant", content: [{ type: "output_text", text: '{"reply":"پیشنهاد"}', annotations: [] }] }],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }));
    const result = await generateText({ model: await getLanguageModel(), prompt: "synthetic", output: Output.object({ schema: z.object({ reply: z.string() }) }), maxOutputTokens: 2200, maxRetries: 0, providerOptions: { openai: { store: false, serviceTier: "default", reasoningEffort: "low" } } });
    expect(result.output).toEqual({ reply: "پیشنهاد" });
    expect(network).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(path.join(dir, "usage-1.json"), "utf8"))).toMatchObject({ usageVerified: true, inputTokens: 10, outputTokens: 20, estimatedMicroUsd: 43 });
  });
  it("the real SDK preserves the safe test-budget category and makes no network call", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-valid-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-5-mini"); vi.stubEnv("AI_PROVIDER", "openai");
    await writeFile(path.join(dir, "HALT.json"), "{}", { flag: "wx" });
    const network = vi.spyOn(globalThis, "fetch");
    const failure = await generateText({ model: await getLanguageModel(), prompt: "synthetic", maxOutputTokens: 2200, maxRetries: 0, providerOptions: { openai: { store: false, serviceTier: "default", reasoningEffort: "low" } } }).then(() => null, error => error);
    expect(failure).not.toBeNull();
    expect(providerFailure(failure)).toBe("test-budget");
    expect(network).not.toHaveBeenCalled();
  });
});
