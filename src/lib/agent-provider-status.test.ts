import { describe, expect, it } from "vitest";
import { providerFailure, providerFailureLabel } from "./agent-provider-status";
describe("safe GPT error categories", () => {
  it.each([
    [{ statusCode: 401 }, "credentials"], [{ statusCode: 403 }, "credentials"],
    [{ statusCode: 429, data: { error: { code: "insufficient_quota" } } }, "credit"],
    [{ statusCode: 429 }, "rate-limit"], [{ name: "TimeoutError" }, "timeout"],
    [{ name: "AbortError" }, "timeout"], [{ name: "AI_NoObjectGeneratedError" }, "invalid-response"],
    [{ name: "ZodError" }, "invalid-response"], [{ statusCode: 500 }, "connection"],
    [{ name: "AI_NoOutputGeneratedError" }, "invalid-response"],
    [{ name: "TiaContextLimitError" }, "context-limit"],
    [{ cause: { name: "TiaContextLimitError" } }, "context-limit"],
  ])("classifies %j without leaking upstream data", (error, expected) => {
    const category = providerFailure({ ...error, message: "private-credential-detail", responseBody: "private-user-text" });
    expect(category).toBe(expected);
    expect(providerFailureLabel(category)).toContain("محلی");
    expect(providerFailureLabel(category)).not.toContain("private");
  });
  it.each([null, undefined, "secret-upstream-error", "__proto__", "constructor"])("does not echo unknown reason %s", error => {
    expect(providerFailureLabel(error)).toBe(providerFailureLabel("connection"));
  });
});
