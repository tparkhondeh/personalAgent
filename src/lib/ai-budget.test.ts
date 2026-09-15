import { beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";

const state = vi.hoisted(() => ({ total: 0, fail: false }));
const reserve = vi.hoisted(() => vi.fn(async () => { state.total++; }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { $transaction: vi.fn(async (fn) => {
  if (state.fail) throw new Error("private database detail");
  return fn({ aiUsage: { aggregate: async () => ({ _sum: { requests: state.total } }), upsert: reserve } });
}) } }));
import { aiReadiness, reserveAiRequest } from "./ai-budget";

beforeEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks(); state.total = 0; state.fail = false;
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key-not-valid");
  vi.stubEnv("OPENAI_COST_APPROVED", "true");
  vi.stubEnv("AI_PROVIDER", "openai");
  vi.stubEnv("OPENAI_DAILY_REQUEST_LIMIT", "20");
  vi.stubEnv("OPENAI_VOICE_ENABLED", "false");
  vi.stubEnv("OPENAI_TRANSCRIBE_MODEL", "");
});

describe("external AI activation and fail-closed reservations", () => {
  it.each(["", " "])("does not enable with a blank key", key => {
    vi.stubEnv("OPENAI_API_KEY", key); expect(aiReadiness().enabled).toBe(false);
  });
  it("requires explicit cost approval", async () => {
    vi.stubEnv("OPENAI_COST_APPROVED", "false");
    expect(await reserveAiRequest("synthetic-user", "text")).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "NaN", "1.5", " "])("does not spend with invalid/zero limit %s", async limit => {
    vi.stubEnv("OPENAI_DAILY_REQUEST_LIMIT", limit);
    expect(aiReadiness().enabled).toBe(false);
    expect(await reserveAiRequest("synthetic-user", "text")).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  });
  it("shares a daily limit across users and text/audio", async () => {
    vi.stubEnv("OPENAI_VOICE_ENABLED", "true");
    vi.stubEnv("OPENAI_TRANSCRIBE_MODEL", "synthetic-audio-model");
    vi.stubEnv("OPENAI_DAILY_REQUEST_LIMIT", "2");
    expect(await reserveAiRequest("user-a", "text")).toBe(true);
    expect(await reserveAiRequest("user-b", "voice")).toBe(true);
    expect(await reserveAiRequest("user-a", "voice")).toBe(false);
    expect(reserve).toHaveBeenCalledTimes(2);
  });
  it("fails closed when the reservation store is unavailable", async () => {
    state.fail = true;
    expect(await reserveAiRequest("synthetic-user", "text")).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  });
  it("does not advertise an unsupported provider as enabled", () => {
    vi.stubEnv("AI_PROVIDER", "unsupported"); expect(aiReadiness().enabled).toBe(false);
  });
  it("keeps paid voice off when only GPT text is configured", async () => {
    expect(aiReadiness()).toMatchObject({ enabled: true, voiceEnabled: false });
    expect(await reserveAiRequest("synthetic-user", "voice")).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  });
  it("a synthetic-test configuration never enables another user's GPT or paid audio", async () => {
    vi.stubEnv("OPENAI_TEST_USER_ID", "synthetic-user");
    vi.stubEnv("OPENAI_TEST_LEDGER_DIR", path.join(os.tmpdir(), "approved-synthetic-ledger"));
    vi.stubEnv("OPENAI_TEST_EXPIRES_AT", new Date(Date.now() + 60000).toISOString());
    vi.stubEnv("OPENAI_VOICE_ENABLED", "true"); vi.stubEnv("OPENAI_TRANSCRIBE_MODEL", "test-audio-model");
    expect(aiReadiness().enabled).toBe(false);
    expect(aiReadiness("synthetic-user")).toMatchObject({ enabled: true, voiceEnabled: false });
    expect(aiReadiness("personal-user").enabled).toBe(false);
    expect(await reserveAiRequest("personal-user", "text")).toBe(false);
    expect(await reserveAiRequest("synthetic-user", "voice")).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
    expect(await reserveAiRequest("synthetic-user", "text")).toBe(true);
  });
  it("requires an explicit audio model as well as separate activation", () => {
    vi.stubEnv("OPENAI_VOICE_ENABLED", "true");
    expect(aiReadiness().voiceEnabled).toBe(false);
    vi.stubEnv("OPENAI_TRANSCRIBE_MODEL", "synthetic-audio-model");
    expect(aiReadiness().voiceEnabled).toBe(true);
    vi.stubEnv("OPENAI_COST_APPROVED", "false");
    expect(aiReadiness().voiceEnabled).toBe(false);
  });
});
