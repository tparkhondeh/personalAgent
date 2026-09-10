import { beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(await reserveAiRequest("synthetic-user", "text")).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  });
  it("shares a daily limit across users and text/audio", async () => {
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
});
