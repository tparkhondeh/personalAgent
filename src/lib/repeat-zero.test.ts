import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import * as planner from "./agent-planner";
import type { Plan } from "./agent-planner";
import { buildEscalationPlan, defaultEscalationPolicy } from "./escalations";
import { createDeviceAlarmScheduler, type DeviceAlarmSchedulerPort, type ScheduledDeviceAlarm } from "./device-alarm-scheduler";

type RepeatSettings = { repeatCount: number; repeatMinutes: number };
type Task = { id?: string; deadline?: string; done?: boolean; archived?: boolean; priority?: string; reminderOffsets?: number[]; approvedPlan?: Plan; urgentRepeatPolicy?: RepeatSettings; notificationIds?: number[]; alarmCancellations?: { id: number; taskId: string }[] };
type Storage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };
type Result = { ok: boolean; value?: RepeatSettings | null };
type Domain = {
  repeatSettingsDefaults: RepeatSettings;
  createRepeatSettingsStore: (storage: Storage) => { load: () => Result; save: (value: unknown) => Result };
  manualRepeatPolicy: (task?: Task, settings?: RepeatSettings | null) => RepeatSettings | undefined;
  repeatSummary: (policy?: RepeatSettings | null) => string;
  notificationTimes: (task: Task, shared: typeof planner, now: number) => number[];
  notificationIds: (task: Task) => number[];
};
const context = { window: {} as { HamrahOffline: Domain } };
vm.runInNewContext(readFileSync("mobile-shell/domain.js", "utf8"), context);
const domain = context.window.HamrahOffline;
const app = readFileSync("mobile-shell/app.js", "utf8");
const now = new Date("2026-09-06T08:00:00Z");
const zero = { repeatCount: 0, repeatMinutes: 15 };
function urgentPlan(overrides: Partial<Plan> = {}): Plan {
  return { ...planner.planPersian("فردا ساعت 17 گزارش بساز", { now }).plan!, priority: "URGENT", escalation: true, channels: ["IN_APP", "ALARM"], reminderOffsets: [], ...zero, ...overrides };
}
function task(plan = urgentPlan()): Task {
  return { id: "synthetic-repeat-zero", deadline: planner.planInstant(plan.date, plan.time, plan.timezone)!.toISOString(), priority: "urgent", done: false, approvedPlan: plan };
}
function memory(raw: string | null = null) {
  const state = { raw, denyRead: false, denyWrite: false };
  const storage = {
    getItem: vi.fn(() => { if (state.denyRead) throw Error("read denied"); return state.raw; }),
    setItem: vi.fn((_key: string, value: string) => { if (state.denyWrite) throw Error("quota"); state.raw = value; }),
  };
  return { state, storage, create: () => domain.createRepeatSettingsStore(storage) };
}

describe("zero extra alerts, separate from task recurrence", () => {
  it.each(["0", "۰", "٠", "صفر"])("validates an explicit %s repeats without losing the first alarm", word => {
    const result = planner.planPersian(`فردا ساعت 17 گزارش فوری بساز؛ آلارم و تشدید هشدار ${word} بار`, { now });
    expect(result.plan?.repeatCount).toBe(0);
    expect(result.questions).toEqual([]);
    expect(planner.approvalSummary(result.plan!).followUp).toBe("هشدار اولیه در موعد؛ بدون تکرار اضافه");
    const item = task(result.plan!);
    expect(domain.notificationTimes(item, planner, now.getTime())).toEqual([Date.parse(item.deadline!)]);
  });
  it.each([-1, 0.5, 7])("rejects invalid planner count %s", repeatCount => {
    expect(planner.inspectPlan(urgentPlan({ repeatCount }), now).questions.join(" ")).toContain("تعداد هشدار");
  });
  it("keeps daily and weekly occurrence counts intact and bounded", () => {
    for (const recurrence of ["DAILY", "WEEKLY"] as const) {
      const plan = urgentPlan({ recurrence, occurrenceCount: 3 });
      expect(planner.inspectPlan(plan, now).questions).toEqual([]);
      const occurrences = planner.planOccurrences(plan);
      expect(occurrences).toHaveLength(3);
      for (const occurrence of occurrences) expect(domain.notificationTimes({ ...task(plan), deadline: occurrence.instant! }, planner, now.getTime())).toEqual([Date.parse(occurrence.instant!)]);
      expect(planner.approvalSummary(plan).recurrence).toContain("۳ نوبت");
      expect(planner.inspectPlan({ ...plan, occurrenceCount: 0 }, now).questions.join(" ")).toContain("نوبت");
    }
  });
  it("keeps one initial alarm: offline at the deadline, fresh server seed with its delivery grace", () => {
    const item = task(), anchor = new Date(item.deadline!);
    const server = buildEscalationPlan(anchor, { ...defaultEscalationPolicy, urgentMaxRepeats: 0, highPriorityEnabled: true, smsEscalationEnabled: true, callEscalationEnabled: true });
    expect(server.map(entry => entry.level)).toEqual(["IN_APP_PUSH", "ANDROID_ALARM"]);
    expect(server.map(entry => entry.scheduledFor.getTime())).toEqual([anchor.getTime(), anchor.getTime() + 10_000]);
    expect(domain.notificationTimes(item, planner, now.getTime())).toEqual([anchor.getTime()]);
  });
  it("deduplicates an explicit deadline reminder and never sends a missed zero alarm in a burst", () => {
    const item = task(urgentPlan({ reminderOffsets: [60, 0] })), at = Date.parse(item.deadline!);
    expect(domain.notificationTimes(item, planner, now.getTime())).toEqual([at - 3600000, at]);
    expect(domain.notificationTimes(item, planner, at)).toEqual([]);
    expect(domain.notificationTimes(item, planner, at + 3600000)).toEqual([]);
  });
  it("keeps zero's initial alarm at the deadline even with stored legacy quiet hours", () => {
    const item = task(urgentPlan({ time: "23:30", reminderOffsets: [60, 0], quietStart: "22:00", quietEnd: "07:00" }));
    expect(domain.notificationTimes(item, planner, now.getTime())).toEqual([Date.parse(item.deadline!)]);
  });
  it("preserves positive approved times and avoids scheduling unselected/completed/archived alarms", () => {
    const plan = urgentPlan({ repeatCount: 2, repeatMinutes: 20, reminderOffsets: [60] });
    const item = task(plan), at = Date.parse(item.deadline!);
    expect(domain.notificationTimes(item, planner, now.getTime())).toEqual([at - 3600000, at + 1200000, at + 2400000]);
    for (const changes of [{ done: true }, { archived: true }, { approvedPlan: { ...plan, channels: ["IN_APP"] as Plan["channels"] } }]) expect(domain.notificationTimes({ ...item, ...changes }, planner, now.getTime())).toEqual([]);
    expect(domain.notificationTimes(task(urgentPlan({ escalation: false })), planner, now.getTime())).toEqual([]);
  });
});

describe("device repeat settings capture without rewriting older records", () => {
  it("persists zero and its inactive interval across reload without writing at startup", () => {
    const f = memory(), store = f.create();
    expect(store.load()).toEqual({ ok: true, value: null });
    expect(f.storage.setItem).not.toHaveBeenCalled();
    expect(store.save(zero)).toEqual({ ok: true, value: zero });
    expect(f.create().load()).toEqual({ ok: true, value: zero });
    expect(f.storage.setItem).toHaveBeenCalledWith("hamrah-local-urgent-repeats-v1", JSON.stringify(zero));
  });
  it.each(["", "broken", "null", "{}", '{"repeatCount":-1,"repeatMinutes":15}'])("preserves unreadable settings %j and blocks overwrite", raw => {
    const f = memory(raw), store = f.create();
    expect(store.load().ok).toBe(false);
    expect(store.save(zero).ok).toBe(false);
    expect(f.state.raw).toBe(raw);
    expect(f.storage.setItem).not.toHaveBeenCalled();
  });
  it("fails closed for unavailable reads, quota failures and another window's edits", () => {
    const f = memory(JSON.stringify(zero)), store = f.create();
    f.state.denyRead = true; expect(store.load().ok).toBe(false);
    f.state.denyRead = false; expect(store.save(domain.repeatSettingsDefaults).ok).toBe(false);
    store.load(); f.state.denyWrite = true; expect(store.save(domain.repeatSettingsDefaults).ok).toBe(false);
    expect(f.state.raw).toBe(JSON.stringify(zero));
    f.state.denyWrite = false; f.state.raw = JSON.stringify({ repeatCount: 2, repeatMinutes: 30 });
    expect(store.save(zero).ok).toBe(false);
    expect(f.create().load().value).toEqual({ repeatCount: 2, repeatMinutes: 30 });
  });
  it.each([{ repeatCount: -1, repeatMinutes: 15 }, { repeatCount: 7, repeatMinutes: 15 }, { repeatCount: 0.5, repeatMinutes: 15 }, { repeatCount: "0", repeatMinutes: 15 }, { repeatCount: 0, repeatMinutes: 0 }])("rejects invalid settings %j without changing storage", value => {
    const f = memory(), store = f.create(); store.load();
    expect(store.save(value).ok).toBe(false); expect(f.state.raw).toBeNull();
  });
  it("applies saved defaults only to fresh proposals and preserves explicit requests and corrections", () => {
    const captured = planner.planPersian("فردا ساعت 17 گزارش فوری بساز؛ آلارم و تشدید هشدار", { now, ...zero }).plan!;
    expect(captured).toMatchObject(zero);
    const corrected = planner.planPersian("ساعت 18", { now, ...domain.repeatSettingsDefaults, previous: captured }).plan!;
    expect(corrected).toMatchObject({ ...zero, time: "18:00" });
    expect(captured.time).toBe("17:00");
    const explicit = planner.planPersian("فردا ساعت 17 گزارش بساز؛ 2 بار هر 30 دقیقه", { now, ...zero }).plan!;
    expect(explicit).toMatchObject({ repeatCount: 2, repeatMinutes: 30 });
    expect(planner.planPersian('فردا ساعت 17 «2 بار» بساز', { now, ...zero }).plan).toMatchObject(zero);
    expect(planner.planPersian("عنوان کار جدید", { now, ...domain.repeatSettingsDefaults, previous: captured }).plan).toMatchObject(zero);
    expect(planner.planPersian("گزارش را ویرایش کن", { now, ...zero }).plan?.repeatCount).toBe(1);
  });
  it("captures manual settings once, leaves legacy timing alone and keeps completed records", () => {
    const at = Date.parse("2026-09-07T13:30:00Z");
    const legacy = { id: "legacy", priority: "urgent", deadline: new Date(at).toISOString(), reminderOffsets: [60], done: false };
    const before = JSON.stringify(legacy);
    expect(domain.manualRepeatPolicy(legacy, zero)).toBeUndefined();
    expect(domain.notificationTimes(legacy, planner, now.getTime())).toEqual([at - 3600000]);
    const created = { ...legacy, id: "new", urgentRepeatPolicy: domain.manualRepeatPolicy(undefined, zero) };
    const restored = JSON.parse(JSON.stringify(created));
    expect(domain.manualRepeatPolicy(restored, domain.repeatSettingsDefaults)).toEqual(zero);
    expect(domain.notificationTimes(restored, planner, now.getTime())).toEqual([at - 3600000, at]);
    expect(domain.notificationTimes({ ...restored, done: true }, planner, now.getTime())).toEqual([]);
    expect(JSON.stringify(legacy)).toBe(before);
    const positive = { ...legacy, urgentRepeatPolicy: domain.manualRepeatPolicy(undefined, { repeatCount: 2, repeatMinutes: 15 }) };
    expect(domain.notificationTimes(positive, planner, now.getTime())).toEqual([at - 3600000, at, at + 900000, at + 1800000]);
  });
});

describe("offline repeat settings event handlers", () => {
  function fixture(raw: string | null = null) {
    const f = memory(raw), repeatSettingsStore = f.create(), loadedRepeatSettings = repeatSettingsStore.load();
    const nodes = new Map<string, { value: string; disabled: boolean; hidden: boolean; textContent: string; handlers: Record<string, (event: { preventDefault: () => void }) => void>; addEventListener: (name: string, handler: (event: { preventDefault: () => void }) => void) => void }>();
    const $ = (selector: string) => {
      if (!nodes.has(selector)) nodes.set(selector, { value: "", disabled: false, hidden: false, textContent: "", handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; } });
      return nodes.get(selector)!;
    };
    const start = app.indexOf("  const repeatCountInput ="), end = app.indexOf('  document.addEventListener("keydown"', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const current = vm.runInNewContext(app.slice(start, end) + ";(() => repeatSettings)", { $, domain, repeatSettingsStore, loadedRepeatSettings, repeatSettings: loadedRepeatSettings.value }) as () => RepeatSettings | null;
    const event = { preventDefault: vi.fn() };
    return { ...f, $, current, change: () => $("#urgent-max-repeats").handlers.change(event), submit: () => $("#repeat-settings-form").handlers.submit(event) };
  }
  it("hides/disables the interval at zero, saves twice safely, and restores the same UI after reload", () => {
    const f = fixture();
    f.$("#urgent-max-repeats").value = "0"; f.change();
    expect(f.$("#urgent-repeat-interval-field").hidden).toBe(true);
    expect(f.$("#urgent-repeat-minutes").disabled).toBe(true);
    f.$("#urgent-repeat-minutes").value = "";
    f.submit(); f.submit();
    expect(f.current()).toEqual(zero);
    const reloaded = fixture(f.state.raw);
    expect(reloaded.$("#urgent-max-repeats").value).toBe("0");
    expect(reloaded.$("#urgent-repeat-interval-field").hidden).toBe(true);
    expect(reloaded.$("#repeat-settings-status").textContent).toContain("هشدار اولیه در موعد");
    reloaded.$("#urgent-max-repeats").value = "2"; reloaded.change();
    expect(reloaded.$("#urgent-repeat-interval-field").hidden).toBe(false);
    expect(reloaded.$("#urgent-repeat-minutes").value).toBe("15");
  });
  it("does not claim success or change effective policy when persistence fails", () => {
    const f = fixture(JSON.stringify(zero));
    f.state.denyWrite = true; f.$("#urgent-max-repeats").value = "3"; f.change(); f.submit();
    expect(f.current()).toEqual(zero);
    expect(f.$("#repeat-settings-status").textContent).toContain("ذخیره نشد");
    expect(f.state.raw).toBe(JSON.stringify(zero));
  });
  it("renders the actual offline proposal fields with no interval for zero and no follow-up fields when disabled", () => {
    const start = app.indexOf("    const fields=["), end = app.indexOf("    const choices=", start);
    const fields = (plan: Plan) => vm.runInNewContext(app.slice(start, end) + ";fields", { p: plan }) as unknown[][];
    expect(fields(urgentPlan()).map(field => field[1])).toEqual(["title", "repeatCount"]);
    expect(fields(urgentPlan({ repeatCount: 1 })).map(field => field[1])).toEqual(["title", "repeatCount", "repeatMinutes"]);
    expect(fields(urgentPlan({ escalation: false })).map(field => field[1])).toEqual(["title"]);
  });
});

describe("approved zero reaches the offline scheduling adapter", () => {
  function fixture(item = task(urgentPlan({ reminderOffsets: [0] })), pending: ScheduledDeviceAlarm[] = [], delivered: {id:number;tag?:string|null}[] = []) {
    const state = { tasks: [item], saved: JSON.stringify([item]), pending: structuredClone(pending), delivered: structuredClone(delivered), savedAtCancel: "" };
    const localNotifications = {
      schedule: vi.fn(async ({notifications}: {notifications:ScheduledDeviceAlarm[]}) => { state.pending.push(...notifications); }),
      cancel: vi.fn(async ({notifications}: {notifications:{id:number}[]}) => {
        state.savedAtCancel = state.saved;
        // Cap8.3 keeps delivered source records until the separate remove call.
        state.pending = state.pending.filter(p => !notifications.some(n => n.id === p.id) || state.delivered.some(d => d.id === p.id));
      }),
      createChannel: vi.fn(async () => {}),
      getPending: vi.fn(async () => ({notifications:structuredClone(state.pending)})),
      getDeliveredNotifications: vi.fn(async () => ({notifications:structuredClone(state.delivered)})),
      removeDeliveredNotifications: vi.fn(async ({notifications}: {notifications:{id:number;tag?:string|null}[]}) => {
        state.delivered = state.delivered.filter(d => !notifications.some(n => n.id === d.id && n.tag == d.tag));
        state.pending = state.pending.filter(p => !notifications.some(n => n.id === p.id));
      }),
      checkPermissions: vi.fn(async () => ({display:"granted"})),
    };
    const saveTasks = vi.fn((next = state.tasks) => { state.saved = JSON.stringify(next); state.tasks = next; return true; });
    const ensureNotificationAccess = vi.fn(async () => true);
    let nextId = 100;
    const start = app.indexOf("  // Keep mapping persistence"), end = app.indexOf("  function taskMarkup(", start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const handlerStart = app.indexOf("  async function handleListAction("), handlerEnd = app.indexOf('  list.addEventListener("click", handleListAction)', handlerStart);
    expect(handlerStart).toBeGreaterThan(0); expect(handlerEnd).toBeGreaterThan(handlerStart);
    const environment = {
      domain: { ...domain, notificationTimes: (value: Task, shared: typeof planner) => domain.notificationTimes(value, shared, now.getTime()) },
      planner, localNotifications, saveTasks, ensureNotificationAccess, channelId: "synthetic-urgent", notificationId: () => ++nextId,
      alarmStatus:{textContent:""},
      pendingActions:new Set(),render:vi.fn(),$:()=>({textContent:""}),
      alarmSounds:{createDeviceAlarmScheduler:(port:DeviceAlarmSchedulerPort)=>createDeviceAlarmScheduler({...port,now:()=>now.getTime()}),prepareAlarm:async()=>({channelId:"synthetic-urgent",sound:"tia_alarm_dawn_v1.wav",legacySound:false})},
    };
    Object.defineProperty(environment,"tasks",{get:()=>state.tasks});
    const adapter = vm.runInNewContext(app.slice(start,end) + app.slice(handlerStart,handlerEnd) + ";({scheduleNotification, cancelNotifications,handleListAction})",environment) as {
      scheduleNotification: (value: Task) => Promise<boolean>; cancelNotifications: () => Promise<void>; handleListAction: (event: unknown) => Promise<void>;
    };
    return { get item(){return state.tasks[0];}, state, adapter, localNotifications, saveTasks, ensureNotificationAccess,
      complete:()=>adapter.handleListAction({target:{closest:()=>({dataset:{action:"toggle"},closest:()=>({dataset:{id:item.id}})})}}),
    };
  }
  it.each([false,true])("persists one initial alarm ID, dispatches once, and cancels it after completion/reload (delivered=%s)", async delivered => {
    const f = fixture();
    expect(await f.adapter.scheduleNotification(f.item)).toBe(true);
    expect(f.item.notificationIds).toEqual([101]);
    expect(f.localNotifications.schedule).toHaveBeenCalledExactlyOnceWith({ notifications: [expect.objectContaining({ id: 101, schedule: { at: new Date(f.item.deadline!), allowWhileIdle: true } })] });
    expect(f.saveTasks.mock.invocationCallOrder[0]).toBeLessThan(f.localNotifications.schedule.mock.invocationCallOrder[0]);
    const reloaded = fixture(JSON.parse(f.state.saved)[0],f.state.pending,delivered?[{id:101,tag:null}]:[]);
    await reloaded.complete();
    expect(reloaded.localNotifications.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 101 }] });
    expect(JSON.parse(reloaded.state.savedAtCancel)).toEqual([expect.objectContaining({done:true,alarmCancellations:[{id:101,taskId:f.item.id}]})]);
    expect(reloaded.state.pending).toEqual([]);expect(reloaded.state.delivered).toEqual([]);
    expect(JSON.parse(reloaded.state.saved)).toEqual([expect.objectContaining({done:true,alarmCancellations:[]})]);
    expect(reloaded.localNotifications.removeDeliveredNotifications).toHaveBeenCalledTimes(delivered?1:0);
    expect(await reloaded.adapter.scheduleNotification(reloaded.item)).toBe(false);
    expect(reloaded.localNotifications.schedule).not.toHaveBeenCalled();
    expect(f.localNotifications.schedule).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch when permissions or persistence fail", async () => {
    const f = fixture();
    f.ensureNotificationAccess.mockResolvedValueOnce(false);
    expect(await f.adapter.scheduleNotification(f.item)).toBe(false);
    expect(f.saveTasks).toHaveBeenCalledOnce(); // Persist the original mapping before asking permission.
    const failed = fixture();
    failed.saveTasks.mockReturnValueOnce(false);
    await expect(failed.adapter.scheduleNotification(failed.item)).rejects.toThrow("شناسه یادآوری ذخیره نشد");
    expect(failed.localNotifications.schedule).not.toHaveBeenCalled();
    expect(f.localNotifications.schedule).not.toHaveBeenCalled();
  });
});
