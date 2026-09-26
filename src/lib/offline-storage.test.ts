import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync("mobile-shell/storage.js", "utf8");
type Task = { id: string; title: string; category: string; priority: string; done: boolean; [key: string]: unknown };
type Store = { load: () => { ok: boolean; tasks: Task[] }; save: (tasks: unknown) => { ok: boolean; reason?: string }; snapshot: () => Task[] };
function fixture(raw: string | null = null) {
  const state = { raw, writes: 0, denyRead: false, denyWrite: false };
  const storage = {
    getItem: () => { if (state.denyRead) throw Error("denied"); return state.raw; },
    setItem: (_key: string, value: string) => { if (state.denyWrite) throw Error("quota"); state.writes++; state.raw = value; },
  };
  const context = { window: { HamrahStorage: undefined as unknown as { createTaskStore: (value: typeof storage) => Store } } };
  vm.runInNewContext(script, context);
  const create = () => context.window.HamrahStorage.createTaskStore(storage);
  return { state, store: create(), create };
}
const task: Task = { id: "synthetic-1", title: "آزمون ساختگی", category: "personal", priority: "normal", done: false };
describe("bundled offline persistence without destructive fallbacks", () => {
  it("starts empty without writing samples or rewriting storage", () => {
    const f = fixture(); expect(f.store.load()).toEqual({ ok: true, tasks: [] }); expect(f.state.writes).toBe(0);
  });
  it("retains completed records, alarm IDs and unknown legacy fields across reload", () => {
    const old = [{ ...task, done: true, notificationId: 123, notificationIds: [124], legacy: { keep: true } }];
    const f = fixture(JSON.stringify(old)); expect(f.store.load().tasks).toEqual(old);
    expect(f.store.save(old).ok).toBe(true); expect(f.create().load().tasks).toEqual(old);
  });
  it.each(["", "broken", "null", "{}", '[{"id":"partial"}]', JSON.stringify([task, task])])("preserves invalid raw storage %s", raw => {
    const f = fixture(raw); expect(f.store.load().ok).toBe(false); expect(f.store.save([]).ok).toBe(false);
    expect(f.state.raw).toBe(raw); expect(f.state.writes).toBe(0);
  });
  it("does not turn denied reads into permission to create an empty store", () => {
    const f = fixture(JSON.stringify([task])); f.state.denyRead = true;
    expect(f.store.load().ok).toBe(false); f.state.denyRead = false;
    expect(f.store.save([]).ok).toBe(false); expect(f.state.writes).toBe(0);
  });
  it("rolls back failed completion in memory and retains original bytes under quota failure", () => {
    const f = fixture(JSON.stringify([task])); const loaded = f.store.load();
    loaded.tasks[0].done = true; f.state.denyWrite = true;
    expect(f.store.save(loaded.tasks)).toEqual({ ok: false, reason: "unwritable" });
    expect(f.store.snapshot()).toEqual([task]); expect(JSON.parse(f.state.raw!)).toEqual([task]);
    expect(f.state.writes).toBe(0);
  });
  it("allows an explicit retry after a transient quota failure, without duplicate records", () => {
    const f = fixture(); f.store.load(); f.state.denyWrite = true;
    expect(f.store.save([task]).ok).toBe(false); f.state.denyWrite = false;
    expect(f.store.save([task]).ok).toBe(true); expect(f.create().load().tasks).toEqual([task]);
  });
  it("refuses to overwrite newer data written by another window", () => {
    const f = fixture(JSON.stringify([task])); f.store.load();
    const other = f.create(); other.load(); expect(other.save([{ ...task, done: true }]).ok).toBe(true);
    expect(f.store.save([])).toEqual({ ok: false, reason: "changed" });
    expect(f.create().load().tasks).toEqual([{ ...task, done: true }]);
  });
  it.each([{ deadline: "bad" }, { done: "false" }, { notificationIds: {} }, { category: "unknown" }, { approvedPlan: {} }, { archived: "no" }])("rejects incompatible fields without overwriting %j", changed => {
    const f = fixture(JSON.stringify([task])); f.store.load();
    expect(f.store.save([{ ...task, ...changed }]).ok).toBe(false); expect(f.state.writes).toBe(0);
  });
  it("detects corruption after hydration and never replaces it", () => {
    const f = fixture(JSON.stringify([task])); f.store.load(); f.state.raw = "corrupt later";
    expect(f.store.save([task]).reason).toBe("changed"); expect(f.state.raw).toBe("corrupt later");
  });
  it("includes the same guard before app execution in normal and generated recovery UI", () => {
    const html = readFileSync("mobile-shell/index.html", "utf8");
    expect(html.indexOf('./storage.js')).toBeLessThan(html.indexOf('./app.js'));
    const recovery = readFileSync("mobile-shell/connection-error.html", "utf8");
    expect(recovery).toContain("window.HamrahStorage");
    const app = readFileSync("mobile-shell/app.js", "utf8");
    expect(app).toContain('if (!(await saveTasks(next))) { render(); return; }');
    // Persist the complete ID/time snapshot before any native scheduling.
    expect(app).toContain('if (kind !== "test" && !(await saveTasks(tasks.map(item => item.id === task.id ? snapshot : item))))');
    expect(app.indexOf('await saveTasks(tasks.map(item => item.id === task.id ? snapshot : item))')).toBeLessThan(app.indexOf('localAlarmScheduler.sync('));
  });
});
