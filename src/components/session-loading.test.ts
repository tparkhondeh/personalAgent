import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ value: false, set: vi.fn(), cleanup: undefined as undefined | (() => void) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: () => [hooks.value, hooks.set],
  useEffect: (effect: () => () => void) => { hooks.cleanup = effect(); },
}));
import { SessionLoading, SESSION_WAIT_MS } from "./session-loading";

type Props = { children?: ReactNode; onClick?: () => void };
function elements(node: ReactNode): Array<{ type: unknown; props: Props }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}
function text(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("");
  return isValidElement<Props>(node) ? text(node.props.children) : "";
}
beforeEach(() => {
  vi.useFakeTimers(); hooks.value = false; hooks.set.mockClear();
  vi.stubGlobal("window", { setTimeout, clearTimeout, location: { reload: vi.fn() } });
});
afterEach(() => { hooks.cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("bounded authentication loading", () => {
  it("waits for the defined grace period, then reports timeout", () => {
    const tree = SessionLoading();
    expect(text(tree)).toContain("در حال آماده‌سازی");
    expect(elements(tree).some(node => node.type === "button")).toBe(false);
    vi.advanceTimersByTime(SESSION_WAIT_MS - 1); expect(hooks.set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(hooks.set).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("clears its timer when authentication resolves and the loader unmounts", () => {
    SessionLoading(); hooks.cleanup?.(); vi.advanceTimersByTime(SESSION_WAIT_MS);
    expect(hooks.set).not.toHaveBeenCalled();
  });
  it("offers a same-URL reload without changing authentication or storage", () => {
    hooks.value = true; const tree = SessionLoading();
    expect(text(tree)).toContain("بررسی ورود طول کشید");
    elements(tree).find(node => node.type === "button")?.props.onClick?.();
    expect(window.location.reload).toHaveBeenCalledOnce();
    const source = readFileSync("src/components/session-loading.tsx", "utf8");
    expect(source).not.toMatch(/localStorage|sessionStorage|cookie|signIn|signOut|fetch/);
  });
  it("does not enter an authenticated or guest dashboard while pending", () => {
    const source = readFileSync("src/components/personal-agent-dashboard.tsx", "utf8");
    expect(source).toContain("if (isPending) return <SessionLoading />;");
    expect(source.indexOf("if (isPending)")).toBeLessThan(source.indexOf("return <SessionDashboard"));
  });
});
