import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "mobile-shell/index.html"), "utf8");

describe("offline Android mobile shell", () => {
  it("is RTL, local-first and independent from a remote server", () => {
    expect(html).toContain('<html lang="fa" dir="rtl">');
    expect(html).toContain("localStorage");
    expect(html).toContain("LocalNotifications");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("contains valid executable JavaScript", () => {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  });
});
