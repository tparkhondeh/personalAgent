import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { safePushPath, selectPushTarget } from "./push-navigation";

function worker() {
  // Only synthetic events/fetches; never registers or contacts a real worker.
  const handlers: Record<string, (event: unknown) => void> = {};
  const show = vi.fn(async () => undefined), open = vi.fn(async () => undefined);
  const fetch = vi.fn(async () => Response.json({ userId: "account-a" }));
  const context = { self: { location: new URL("https://synthetic.invalid/"), addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, registration: { showNotification: show } }, clients: { openWindow: open }, fetch, URL, Response, AbortSignal, crypto, importScripts: () => undefined };
  runInNewContext(readFileSync("public/sw.js", "utf8"), context);
  async function event(name: string, data: unknown) {
    let pending: Promise<unknown> | undefined;
    handlers[name]({ data: { json: () => data }, notification: { data, close: vi.fn() }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
  }
  return { show, open, fetch, event };
}
const payload = { userId: "account-a", title: "PRIVATE TITLE", body: "PRIVATE BODY", url: "/?view=tasks&taskId=opaque-id", tag: `tia-${"a".repeat(64)}`, urgent: true };
describe("late Web Push privacy and bounded navigation", () => {
  it("resolves opaque links only to active items returned for the authenticated account", () => {
    const owned = [{ id: "owned", source: "task", done: false }, { id: "finished", source: "meeting", done: true }];
    expect(selectPushTarget("?view=tasks&taskId=owned", owned)).toBe(owned[0]);
    for (const search of ["?view=tasks&taskId=foreign", "?view=calendar&meetingId=finished", "?view=calendar&meetingId=owned", "?view=tasks&taskId=owned&title=private"]) expect(selectPushTarget(search, owned)).toBeUndefined();
  });
  it.each(["account-b", null])("suppresses previous-account payload when current account is %s", async userId => {
    const w = worker(); w.fetch.mockResolvedValue(Response.json(userId ? { userId } : {}, { status: userId ? 200 : 401 }));
    await w.event("push", payload); expect(w.show).not.toHaveBeenCalled();
  });
  it("fails closed on offline verification and old unbound/malformed payloads", async () => {
    const w = worker(); w.fetch.mockRejectedValue(Error("offline")); await w.event("push", payload);
    await w.event("push", { title: "old private title" }); await w.event("push", null);
    expect(w.show).not.toHaveBeenCalled();
  });
  it("displays only generic text, even when logout races the account check", async () => {
    const w = worker(); await w.event("push", payload);
    const output = JSON.stringify(w.show.mock.calls); expect(output).not.toMatch(/PRIVATE/);
    expect(w.show).toHaveBeenCalledWith("tia", expect.objectContaining({ data: { userId: "account-a", url: payload.url }, tag: payload.tag }));
    expect(w.fetch).toHaveBeenCalledWith("/api/push-subscriptions", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
    w.fetch.mockResolvedValue(Response.json({ userId: "account-b" }));
    await w.event("notificationclick", payload); expect(w.open).toHaveBeenCalledWith("/");
  });
  it("keeps separate urgent/normal alerts, stable identical tags, and unique invalid-tag fallbacks", async () => {
    const w = worker(); await w.event("push", payload);
    await w.event("push", { ...payload, tag: `tia-${"b".repeat(64)}`, urgent: false });
    await w.event("push", payload);
    for (const tag of ["private title", "x".repeat(1000), "private title"]) await w.event("push", { ...payload, tag });
    const calls = w.show.mock.calls as unknown as [string, { tag: string; requireInteraction: boolean }][];
    expect(calls[0][1].tag).not.toBe(calls[1][1].tag); expect(calls[0][1].tag).toBe(calls[2][1].tag);
    expect(calls[0][1].requireInteraction).toBe(true); expect(calls[1][1].requireInteraction).toBe(false);
    expect(new Set(calls.slice(3).map(call => call[1].tag)).size).toBe(3);
    expect(JSON.stringify(calls)).not.toContain("private title");
  });
  it.each(["/", "/?view=tasks&taskId=opaque-id", "/?view=calendar&meetingId=opaque_id", "/?view=tasks", "https://evil.example/", "//evil.example/", "/\\evil.example/", "/api/tasks", "/?view=tasks&taskId=private%20title", "/?view=tasks&taskId=opaque&title=private", "/?view=calendar#private"])("worker and sender agree on approved path %s", async path => {
    const w = worker(); await w.event("notificationclick", { ...payload, url: path });
    expect(w.open).toHaveBeenCalledWith(safePushPath(path));
  });
});
