import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planPersian } from "./agent-planner";

const state = vi.hoisted(() => ({ session: true, enabled: true, reserved: true, limited: false }));
const mocks = vi.hoisted(() => ({ generate: vi.fn(), reserve: vi.fn(), save: vi.fn(), create: vi.fn(), messages: vi.fn(), conversation: vi.fn(), prior: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generate, Output: { object: (value: unknown) => value } }));
vi.mock("@/lib/agent", () => ({ getLanguageModel: () => "synthetic-model", agentSystemPrompt: "synthetic-system" }));
vi.mock("@/lib/api", () => ({ requireApiSession: async () => state.session ? { user: { id: "synthetic-user" } } : null, jsonError: (error: string, status: number) => Response.json({ error }, { status }) }));
vi.mock("@/lib/rate-limit", () => ({ guardUserRateLimit: () => state.limited ? Response.json({}, { status: 429 }) : null }));
vi.mock("@/lib/ai-budget", () => ({ aiReadiness: () => ({ enabled: state.enabled }), reserveAiRequest: mocks.reserve }));
vi.mock("@/lib/db", () => ({ db: {
  conversation: { findFirst: mocks.conversation, create: mocks.create }, agentDraft: { findFirst: mocks.prior },
  userPreference: { findUnique: async () => null }, message: { createMany: mocks.messages },
} }));
vi.mock("@/lib/agent-drafts", () => ({
  DraftError: class extends Error {}, ownedPlanningItems: async () => [], saveDraft: mocks.save,
}));
import { POST } from "@/app/api/agent/route";

const message = "فردا ساعت پنج عصر جلسه با تیم فروش دارم؛ سه ساعت قبل یادم بنداز";
function request(body: Record<string, unknown> = {}, signal?: AbortSignal, origin = "http://localhost:3001") {
  return new Request("http://localhost:3001/api/agent", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ message, externalConsent: true, ...body }), signal });
}
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(state, { session: true, enabled: true, reserved: true, limited: false });
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");
  mocks.reserve.mockImplementation(async () => state.reserved);
  mocks.create.mockResolvedValue({ id: "conversation-owned" });
  mocks.save.mockImplementation(async (_owner, _conversation, plan) => ({ id: "pending-only", revision: 1, status: "PENDING", plan }));
  mocks.generate.mockResolvedValue({ output: { reply: "پیشنهاد را بررسی و ثبت کن", plan: planPersian(message, { timezone: "Asia/Tehran", items: [] }).plan, questions: [] } });
});
afterEach(() => vi.unstubAllEnvs());

describe("assistant external path, synthetic provider with no network", () => {
  it.each([{ externalConsent: false }, { localOnly: true }])("never sends without consent or in local-only mode: %j", async body => {
    const result = await POST(request(body));
    expect((await result.json()).data.mode).toBe("local");
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("keeps local planning usable without activation", async () => {
    state.enabled = false;
    const result = await POST(request()); expect((await result.json()).data.mode).toBe("local");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("reserves before sending and returns only a pending, editable proposal", async () => {
    const result = await POST(request()); const data = (await result.json()).data;
    expect(data.mode).toBe("online"); expect(data.draft.status).toBe("PENDING");
    expect(data.draft.plan.title).toBe("جلسه با تیم فروش"); expect(data.draft.plan.time).toBe("17:00");
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.generate.mock.invocationCallOrder[0]);
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ maxRetries: 0, maxOutputTokens: 2200, providerOptions: { openai: { store: false } } });
    expect(mocks.generate.mock.calls[0][0].tools).toBeUndefined();
    expect(mocks.save.mock.calls[0][0]).toBe("synthetic-user");
  });
  it("does not send when the persistent budget refuses", async () => {
    state.reserved = false;
    expect((await (await POST(request())).json()).data.mode).toBe("local-budget-limit");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each(["quota exhausted", "DNS failed", "timeout", "invalid structured output", "invalid key"])("falls back safely on %s", async reason => {
    mocks.generate.mockRejectedValue(new Error(`private-provider-detail: ${reason}`));
    const result = await POST(request()); const data = await result.json();
    expect(result.status).toBe(200); expect(data.data.mode).toBe("local-fallback");
    expect(data.data.draft.plan.title).toBe("جلسه با تیم فروش");
    expect(JSON.stringify(data)).not.toContain("private-provider-detail");
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("does not spend or persist an already cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    expect((await POST(request({}, controller.signal))).status).toBe(408);
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("propagates cancellation to the provider and does not save a late response", async () => {
    const controller = new AbortController();
    mocks.generate.mockImplementation(async options => {
      controller.abort(); expect(options.abortSignal.aborted).toBe(true);
      throw new Error("cancelled");
    });
    expect((await POST(request({}, controller.signal))).status).toBe(408);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.messages).not.toHaveBeenCalled();
  });
  it.each(["origin", "login", "rate", "input", "conversation", "revision"])("rejects invalid %s before external transmission", async reason => {
    state.session = reason !== "login"; state.limited = reason === "rate";
    const body = reason === "input" ? { message: "" } : reason === "conversation" ? { conversationId: "other-owner" } : reason === "revision" ? { draftId: "stale", revision: 1 } : {};
    const result = await POST(request(body, undefined, reason === "origin" ? "https://wrong.invalid" : undefined));
    expect(result.status).toBe(({ origin: 403, login: 401, rate: 429, input: 422, conversation: 404, revision: 409 } as Record<string, number>)[reason]);
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
