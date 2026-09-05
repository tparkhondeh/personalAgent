import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("PWA service worker", () => {
  it("never serves a stale interactive-looking shell during local development", () => {
    const worker = readProjectFile("public/sw.js");

    expect(worker).toContain('CACHE_NAME = "hamrah-shell-v5"');
    expect(worker).toContain('self.location.hostname === "localhost"');
    expect(worker).toContain('self.location.hostname === "127.0.0.1"');
    expect(worker).toContain("if (IS_LOCAL_DEVELOPMENT) return;");
    expect(worker).toContain("IS_LOCAL_DEVELOPMENT || key !== CACHE_NAME");
  });

  it("checks for a fresh worker instead of reusing the browser HTTP cache", () => {
    const dashboard = readProjectFile("src/components/personal-agent-dashboard.tsx");
    const pushClient = readProjectFile("src/lib/push-client.ts");

    expect(dashboard).toContain('updateViaCache: "none"');
    expect(pushClient).toContain('updateViaCache: "none"');
  });
});
