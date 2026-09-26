import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const script = readFileSync("mobile-shell/storage.js", "utf8");
const task = { id: "synthetic-durable", title: "آزمون", category: "personal", priority: "normal", done: false, legacy: { retained: true } };
type Request = { id: string; op: string; expectedRevision?: number; nextRaw?: string };
type Result = { ok: boolean; reason?: string; tasks?: typeof task[] };
type Store = { load(): Promise<Result>; save(tasks: unknown): Promise<Result>; snapshot(): typeof task[]; writable(): boolean };
function fixture(raw: string | null = null, legacy: string | null = JSON.stringify([task])) {
  const state = { raw, revision: raw === null ? 0 : 4, legacy, legacyReads: 0, mirrors: 0, denyLegacyRead: false, denyMirror: false };
  const posted: Request[] = [];
  const bridge = { onmessage: (_event: { data: string }) => { void _event; }, postMessage: (value: string) => { const request = JSON.parse(value); posted.push(request); handler(request); } };
  const reply = (request: Request, value: object) => bridge.onmessage({ data: JSON.stringify({ id: request.id, ...value }) });
  const normal = (request: Request) => {
    if (request.op === "cas") {
      if (request.expectedRevision !== state.revision) { reply(request, { ok: false, error: "CONFLICT" }); return; }
      state.raw = request.nextRaw!; state.revision++;
    }
    reply(request, { ok: true, revision: state.revision, raw: state.raw });
  };
  let handler = normal;
  const storage = {
    getItem: () => { state.legacyReads++; if (state.denyLegacyRead) throw Error("synthetic denied read"); return state.legacy; },
    setItem: (_key: string, value: string) => { if (state.denyMirror) throw Error("synthetic quota"); state.mirrors++; state.legacy = value; },
  };
  const context = vm.createContext({ window: { TiaTaskStoreNative: bridge, Capacitor: { getPlatform: () => "android" } }, setTimeout, clearTimeout });
  vm.runInContext(script, context);
  const create = () => context.window.HamrahStorage.createTaskStore(storage, { timeoutMs: 20 }) as Store;
  return { state, posted, bridge, storage, context, create, store: create(), reply, normal, handle: (value: typeof handler) => { handler = value; } };
}
afterEach(() => vi.useRealTimers());

describe("native whole-snapshot revision CAS and migration", () => {
  it("imports exact valid legacy bytes only after the native absent envelope, retaining unknown fields", async () => {
    const raw = " [ " + JSON.stringify(task) + " ] ";
    const f = fixture(null, raw); const result = await f.store.load();
    expect(result).toEqual({ ok: true, tasks: [task] });
    expect(f.posted.map(r => r.op)).toEqual(["read", "cas"]);
    expect(f.posted[1]).toMatchObject({ expectedRevision: 0, nextRaw: raw });
    expect(f.state).toMatchObject({ raw, legacy: raw, revision: 1 });
  });
  it("does not write an absent, genuinely empty install before a user mutation", async () => {
    const f = fixture(null, null); expect(await f.store.load()).toEqual({ ok: true, tasks: [] });
    expect(f.posted.map(r => r.op)).toEqual(["read"]); expect(f.state.mirrors).toBe(0);
    expect((await f.store.save([task])).ok).toBe(true); expect(f.state.revision).toBe(1);
  });
  it.each(["[]", JSON.stringify([{ ...task, done: true }])])("uses initialized native data, not different legacy bytes: %s", async raw => {
    const f = fixture(raw); f.state.denyLegacyRead = true;
    expect((await f.store.load()).tasks).toEqual(JSON.parse(raw)); expect(f.state.legacyReads).toBe(0);
    expect(f.state.legacy).toBe(raw);
  });
  it.each(["INVALID", "CORRUPT", "CONFLICT", "STORAGE", "BUSY"])("fails closed on native read %s without importing legacy", async error => {
    const f = fixture(); f.handle(r => f.reply(r, { ok: false, error }));
    expect((await f.store.load()).ok).toBe(false); expect((await f.store.save([])).ok).toBe(false);
    expect(f.state.legacyReads).toBe(0); expect(f.state.mirrors).toBe(0); expect(f.posted).toHaveLength(1);
  });
  it.each([{ revision: 0, raw: "[]" }, { revision: 1, raw: null }, { revision: -1, raw: "[]" },
    { revision: 1.5, raw: "[]" }, { revision: Number.MAX_SAFE_INTEGER + 1, raw: "[]" }, { revision: 1, raw: "broken" },
    { revision: 1, raw: "{}" }, { revision: 1, raw: '[{"id":"partial"}]' }])("rejects malformed read without legacy fallback %j", async envelope => {
    const f = fixture(); f.handle(r => f.reply(r, { ok: true, ...envelope }));
    expect((await f.store.load()).ok).toBe(false); expect(f.state.legacyReads).toBe(0); expect(f.store.writable()).toBe(false);
  });
  it.each(["broken", "null", "{}", "", JSON.stringify([task, task])])("never migrates invalid legacy %s", async legacy => {
    const f = fixture(null, legacy); expect((await f.store.load()).ok).toBe(false);
    expect(f.posted).toHaveLength(1); expect(f.state.legacy).toBe(legacy); expect(f.state.raw).toBeNull();
  });
  it("never turns an unreadable legacy source into an empty migration", async () => {
    const f = fixture(); f.state.denyLegacyRead = true; expect((await f.store.load()).ok).toBe(false);
    expect(f.posted).toHaveLength(1); expect(f.state.raw).toBeNull();
  });
  it("keeps the prior snapshot and mirror while commit waits and freezes the candidate before awaiting", async () => {
    const f = fixture("[]"); await f.store.load(); f.handle(() => {});
    const candidate = [{ ...task }], write = f.store.save(candidate);
    candidate[0].title = "not approved"; candidate.push({ ...task, id: "not approved" });
    expect(f.store.snapshot()).toEqual([]); expect(f.state.legacy).toBe("[]");
    expect(await f.store.save([])).toMatchObject({ ok: false, reason: "busy" }); expect(f.posted).toHaveLength(2);
    f.normal(f.posted[1]); expect((await write).ok).toBe(true);
    expect(f.store.snapshot()).toEqual([task]); expect(f.state.revision).toBe(5);
  });
  it("rejects a stale second window instead of rebasing its candidate on the newest revision", async () => {
    const f = fixture("[]"), second = f.create(); await f.store.load(); await second.load();
    await f.store.save([task]); expect(await second.save([])).toMatchObject({ ok: false, reason: "changed" });
    expect(f.posted.at(-1)).toMatchObject({ expectedRevision: 4, nextRaw: "[]" });
    expect(JSON.parse(f.state.raw!)).toEqual([task]); expect(second.writable()).toBe(false);
  });
  it("accepts a durable commit despite a failing legacy mirror and cold-reads native authority", async () => {
    const f = fixture("[]"); await f.store.load(); f.state.denyMirror = true;
    expect((await f.store.save([task])).ok).toBe(true); expect(f.state.legacy).toBe("[]");
    expect((await f.create().load()).tasks).toEqual([task]);
  });
  it.each(["INVALID", "CORRUPT", "CONFLICT", "STORAGE", "BUSY"])("does not turn a failed %s commit into readback success or a writable store", async error => {
    const f = fixture("[]"); await f.store.load(); f.handle(r => f.reply(r, { ok: false, error }));
    expect((await f.store.save([task])).ok).toBe(false); expect(f.store.snapshot()).toEqual([]);
    expect((await f.store.load()).ok).toBe(false); expect((await f.store.save([task])).ok).toBe(false);
    expect(f.posted.map(r => r.op)).toEqual(["read", "cas"]); expect(f.state.legacy).toBe("[]");
  });
  it("rejects safe-integer exhaustion before sending a CAS", async () => {
    const f = fixture("[]"); f.state.revision = Number.MAX_SAFE_INTEGER; await f.store.load();
    expect((await f.store.save([task])).ok).toBe(false); expect(f.posted).toHaveLength(1);
  });
  it("does not fall back when the Android bridge is missing", async () => {
    const f = fixture(); delete f.context.window.TiaTaskStoreNative;
    const store = f.create(); expect((await store.load()).ok).toBe(false); expect((await store.save([task])).ok).toBe(false);
    expect(f.state.legacyReads).toBe(0); expect(f.state.mirrors).toBe(0);
  });
  it.each(["exact", "previous", "later", "different", "poisoned"])("resolves a lost ack only through healthy exact next revision/raw: %s", async kind => {
    vi.useFakeTimers(); const f = fixture("[]"); await f.store.load();
    f.handle(r => {
      if (r.op === "cas") return; // The reply is lost; never retry this write.
      if (kind === "poisoned") f.reply(r, { ok: false, error: "STORAGE" });
      else f.reply(r, { ok: true, revision: kind === "previous" ? 4 : kind === "later" ? 6 : 5,
        raw: kind === "different" ? "[]" : JSON.stringify([task]) });
    });
    const write = f.store.save([task]); await vi.advanceTimersByTimeAsync(21);
    expect((await write).ok).toBe(kind === "exact"); expect(f.store.writable()).toBe(kind === "exact");
    expect(f.posted.map(r => r.op)).toEqual(["read", "cas", "read"]);
    expect(f.store.snapshot()).toEqual(kind === "exact" ? [task] : []);
  });
  it("ignores a late original ack after failed reconciliation without reopening writes", async () => {
    vi.useFakeTimers(); const f = fixture("[]"); await f.store.load(); f.handle(() => {});
    const write = f.store.save([task]); await vi.advanceTimersByTimeAsync(41);
    expect((await write).ok).toBe(false); f.reply(f.posted[1], { ok: true, revision: 5, raw: JSON.stringify([task]) });
    expect(f.store.writable()).toBe(false); expect(f.store.snapshot()).toEqual([]);
  });
  it.each(["BUSY", "INVALID"])("fails every pending request closed on preparse id:null %s without retry", async error => {
    const f = fixture("[]"), other = f.create(); await f.store.load(); await other.load(); f.handle(() => {});
    const first = f.store.save([task]), second = other.save([]);
    f.bridge.onmessage({ data: JSON.stringify({ id: null, ok: false, error }) });
    expect((await first).ok).toBe(false); expect((await second).ok).toBe(false);
    expect(f.store.writable()).toBe(false); expect(other.writable()).toBe(false);
    const count = f.posted.length; expect((await f.create().load()).ok).toBe(false); expect(f.posted).toHaveLength(count);
    expect(f.posted.map(r => r.op)).toEqual(["read", "read", "cas", "cas"]);
    expect(f.state.legacy).toBe("[]");
  });
});
