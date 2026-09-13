import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("private activation report never advertises a disabled budget as configured", () => {
  it.each(["0", "-1", " ", "not-a-number", "2.5"])("rejects invalid limit %s without contacting a provider", limit => {
    const report = JSON.parse(execFileSync(process.execPath, ["scripts/integration-readiness.mjs"], {
      encoding: "utf8", windowsHide: true,
      env: { ...process.env, OPENAI_API_KEY: "synthetic-only-key", OPENAI_COST_APPROVED: "true", AI_PROVIDER: "openai", OPENAI_DAILY_REQUEST_LIMIT: limit },
    }));
    expect(report.llm.configured).toBe(false);
    expect(report.llm.liveTested).toBe(false);
    expect(report.externalRequestsMade).toBe(0);
    expect(JSON.stringify(report)).not.toContain("synthetic-only-key");
  });
});
