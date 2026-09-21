import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { initialDashboardView } from "./startup-navigation";
import { loginReturnTo } from "./login-redirect";

describe("ordinary launch opens Tasks without opening an editor", () => {
  it.each(["", "?", "?view=", "?view=new", "?view=create", "?view=unknown", "?view=tasks&view=assistant", "?item=synthetic-123", "?view=https%3A%2F%2Fexample.invalid"])("defaults safely for %s", search => {
    expect(initialDashboardView(search)).toBe("tasks");
  });
  it.each(["today", "tasks", "calendar", "assistant", "settings"])("preserves explicit %s deep links and leaves the item query intact", view => {
    const search = `?view=${view}&item=synthetic-123`;
    expect(initialDashboardView(search)).toBe(view);
    expect(new URLSearchParams(search).get("item")).toBe("synthetic-123");
  });
  it("normal and remembered login resolve to Tasks; an assistant return stays explicit", () => {
    expect(initialDashboardView(new URL(loginReturnTo(undefined), "https://example.invalid").search)).toBe("tasks");
    expect(initialDashboardView(new URL(loginReturnTo("assistant"), "https://example.invalid").search)).toBe("assistant");
  });
  it("uses Tasks for PWA startup without changing the installation identity", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.id).toBe("/");
    expect(initialDashboardView(new URL(manifest.start_url, "https://example.invalid").search)).toBe("tasks");
  });
  it("the generated Android implementation follows exactly the same launch policy", () => {
    const context = { window: {} as { HamrahOverview: { initialDashboardView: typeof initialDashboardView } }, URLSearchParams };
    runInNewContext(readFileSync("mobile-shell/content.js", "utf8"), context);
    for (const search of ["", "?view=assistant", "?view=tasks", "?view=today", "?view=calendar&item=123", "?view=new", "?view=tasks&view=calendar"]) {
      expect(context.window.HamrahOverview.initialDashboardView(search)).toBe(initialDashboardView(search));
    }
    const shell = readFileSync("mobile-shell/app.js", "utf8");
    expect(shell).toContain("let panel = overview.initialDashboardView(window.location.search)");
    expect(shell).toMatch(/showPanel\(panel\);\s*\}\)\(\);\s*$/);
    const html = readFileSync("mobile-shell/index.html", "utf8");
    expect(html).toContain('id="task-modal" class="modal"');
    expect(html).toContain("data-open-form");
  });
});
