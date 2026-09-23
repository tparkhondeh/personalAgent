import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/bundled-startup-qa.mjs", "utf8").replace("export function", "function");
function inspect({ panel = "tasks", nav = true, content = true, editor = false } = {}) {
  const node = (active: boolean, dataset = {}) => ({ dataset, classList: { contains: () => active } });
  const root = node(false, { panel });
  const nodes: Record<string, unknown> = {
    ".app": root,
    '[data-panel="tasks"]': root, // Same attribute on the earlier container is NOT a navigation button.
    'button[data-panel="tasks"]': node(nav),
    "#today-panel": node(content),
    "#task-modal": node(editor),
  };
  return runInNewContext(`${source}\nbundledStartupQa()`, { document: { querySelector: (selector: string) => nodes[selector] } });
}
describe("bundled startup acceptance selects the actual navigation button", () => {
  it("accepts Tasks while the containing app has no active class", () => {
    expect(inspect()).toEqual({ tasks: true, editorClosed: true });
  });
  it.each([{ panel: "today" }, { nav: false }, { content: false }, { editor: true }])("rejects incorrect startup %j", state => {
    expect(() => inspect(state)).toThrow();
  });
  it("all panel interactions in the emulator target buttons, not the state container", () => {
    for (const name of ["android-webview-inspect", "dashboard-ui-qa", "android-persian-speech-qa"]) {
      expect(/(?:querySelector|click)\('\[data-panel=/.test(readFileSync(`scripts/${name}.mjs`, "utf8")), name).toBe(false);
    }
  });
  it("keeps bounded warm-up and stability while observing both GMS process identities", () => {
    const warmup = readFileSync("scripts/android-emulator-settle.sh", "utf8");
    expect(warmup).toContain("pidof com.google.android.gms.persistent com.google.android.gms");
    expect(warmup).toContain("elapsed >= 300 && stable >= 120");
    expect(warmup).toContain("elapsed < 600");
  });
});
