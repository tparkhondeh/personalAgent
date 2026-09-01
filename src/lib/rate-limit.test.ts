import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("allows requests up to the configured limit", () => {
    const limiter = createRateLimiter();
    expect(limiter.consume("agent:user-1", 2, 60_000, 1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("agent:user-1", 2, 60_000, 1_001)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("agent:user-1", 2, 60_000, 1_002)).toMatchObject({ allowed: false, retryAfterSeconds: 60 });
  });

  it("starts a fresh window after the reset time", () => {
    const limiter = createRateLimiter();
    limiter.consume("mutation:user-1", 1, 1_000, 5_000);
    expect(limiter.consume("mutation:user-1", 1, 1_000, 5_999).allowed).toBe(false);
    expect(limiter.consume("mutation:user-1", 1, 1_000, 6_000)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("keeps users and scopes independent", () => {
    const limiter = createRateLimiter();
    limiter.consume("agent:user-1", 1, 60_000, 1_000);
    expect(limiter.consume("agent:user-2", 1, 60_000, 1_001).allowed).toBe(true);
    expect(limiter.consume("mutation:user-1", 1, 60_000, 1_001).allowed).toBe(true);
  });
});
