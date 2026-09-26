import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeviceAlarmScheduler, type PendingDeviceAlarm, type ScheduledDeviceAlarm } from "./device-alarm-scheduler";
import { createNativeAlarmSession, NATIVE_ALARM_SESSION_KEY, watchNativeAlarmSession, type NativeAlarmSessionPort } from "./native-alarm-session";

const native = vi.hoisted(() => ({ enabled: false, port: {} }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.enabled, getPlatform: () => "android" } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: native.port }));
afterEach(() => { native.enabled = false; vi.unstubAllGlobals(); });

const owner = "hamrah-approved-reminders", urgent = "hamrah-urgent-escalation";
const row = (id: number, tag = owner): PendingDeviceAlarm => ({ id, extra: { owner: tag, reminderId: `reminder-${id}` } });
const local = row(90, "hamrah-local");
function fixture(values = new Map<string, string>()) {
  const state = { pending: [] as PendingDeviceAlarm[], delivered: [] as { id: number; tag?: string | null }[], deny: false };
  const port = {
    storage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {
      if (state.deny) throw Error("quota"); values.set(key, value);
    } },
    getPending: vi.fn(async () => ({ notifications: structuredClone(state.pending) })),
    // Real Cap8.3 semantics: cancel retains delivered source records.
    cancel: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
      expect(JSON.parse(values.get(NATIVE_ALARM_SESSION_KEY)!).cleanup).toBe(true);
      state.pending = state.pending.filter(p => !notifications.some(n => n.id === p.id) || state.delivered.some(d => d.id === p.id));
    }),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: structuredClone(state.delivered) })),
    removeDeliveredNotifications: vi.fn(async ({ notifications }: { notifications: { id: number; tag?: string | null }[] }) => {
      expect(JSON.parse(values.get(NATIVE_ALARM_SESSION_KEY)!).cleanup).toBe(true);
      state.delivered = state.delivered.filter(d => !notifications.some(n => n.id === d.id && n.tag == d.tag));
      state.pending = state.pending.filter(p => !notifications.some(n => n.id === p.id));
    }),
  } satisfies NativeAlarmSessionPort;
  const session = createNativeAlarmSession(port);
  const scheduler = createDeviceAlarmScheduler({ ...port, owner,
    schedule: vi.fn(async ({ notifications }: { notifications: ScheduledDeviceAlarm[] }) => { state.pending.push(...notifications); }),
    checkPermissions: async () => ({ display: "granted" }),
    prepareAlarm: async () => ({ channelId: "old-sound", sound: "s", legacySound: false }),
    prepareNotification: async () => "normal",
  });
  return { state, port, session, scheduler, values, journal: () => JSON.parse(values.get(NATIVE_ALARM_SESSION_KEY)!) };
}
const request = (id: number) => ({ ...row(id), at: Date.now() + 60_000, alarm: true, title: "synthetic", body: "private" });

describe("durable account-only native privacy cleanup", () => {
  it("cold guest clears both owners' pending AND delivered records, never local or another tag", async () => {
    const f = fixture(); f.state.pending = [row(1), row(2, urgent), local];
    f.state.delivered = [{ id: 1, tag: null }, { id: 2 }, { id: 90 }, { id: 1, tag: "foreign-tag" }];
    expect(await f.session.setAccount(null)).toMatchObject({ state: "ready", canSchedule: false });
    expect(f.state.pending).toEqual([local]);
    expect(f.state.delivered).toEqual([{ id: 90 }, { id: 1, tag: "foreign-tag" }]);
    expect(f.journal()).toMatchObject({ cleanup: false, receipts: [] });
    expect((await f.scheduler.sync(async () => [request(3)])).acceptedIds).toEqual([]);
  });
  it.each(["cancel", "getPending", "getDeliveredNotifications", "removeDeliveredNotifications"] as const)("retains failures of %s and retries after reload before allowing a replacement", async phase => {
    const f = fixture(); f.state.pending = [row(1), local]; f.state.delivered = [{ id: 1 }];
    f.port[phase].mockRejectedValueOnce(Error("lost bridge reply"));
    expect(await f.session.setAccount("B")).toMatchObject({ state: "blocked", canSchedule: false });
    expect(f.journal().cleanup).toBe(true);
    expect((await f.scheduler.sync(async () => [request(2)])).acceptedIds).toEqual([]);
    const reload = fixture(f.values); reload.state.pending = f.state.pending; reload.state.delivered = f.state.delivered;
    expect(await reload.session.setAccount("B")).toMatchObject({ state: "ready", canSchedule: true });
    expect(reload.state.pending).toEqual([local]); expect(reload.state.delivered).toEqual([]);
    expect((await reload.scheduler.sync(async () => [request(2)])).acceptedIds).toEqual([2]);
  });
  it("does not trust a successful bridge reply without readback", async () => {
    const f = fixture(); f.state.pending = [row(1)]; f.port.cancel.mockResolvedValueOnce(undefined);
    expect((await f.session.setAccount(null)).state).toBe("blocked");
    expect(f.journal().receipts).toEqual([{ id: 1, owner }]);
    expect((await f.session.retry()).state).toBe("ready");
  });
  it("keeps a late old future alarm discovered only by the final live read fenced and durable until retry", async () => {
    const f = fixture(); await f.session.setAccount("A");
    f.port.getPending.mockClear();
    const late = { ...row(1), schedule: { at: new Date("2099-01-02T08:00:00Z"), allowWhileIdle: true } };
    // No scheduler write is in flight: busy() is already false. The initial,
    // stored and remaining snapshots are empty; only the final live read sees it.
    f.port.getPending
      .mockResolvedValueOnce({ notifications: [] })
      .mockResolvedValueOnce({ notifications: [] })
      .mockResolvedValueOnce({ notifications: [] })
      .mockImplementationOnce(async () => {
        f.state.pending.push(late);
        return { notifications: structuredClone(f.state.pending) };
      });
    expect(await f.session.setAccount("B")).toMatchObject({ state: "blocked", canSchedule: false });
    expect(f.port.getPending).toHaveBeenCalledTimes(4);
    expect(f.state.pending).toEqual([late]);
    expect(f.journal()).toMatchObject({ account: "B", cleanup: true, receipts: [{ id: 1, owner }] });
    const load = vi.fn(async () => [request(2)]);
    expect((await f.scheduler.sync(load)).acceptedIds).toEqual([]);
    expect(load).not.toHaveBeenCalled();
    expect(f.port.cancel).not.toHaveBeenCalled();
    expect(f.journal().cleanup).toBe(true);
    expect(await f.session.retry()).toMatchObject({ state: "ready", canSchedule: true });
    expect(f.port.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 1 }] });
    expect(f.state.pending).toEqual([]);
    expect(f.journal()).toMatchObject({ account: "B", cleanup: false, receipts: [] });
    expect((await f.scheduler.sync(load)).acceptedIds).toEqual([2]);
  });
  it("storage failure fences old fetches with zero native mutations, and visible retry can recover", async () => {
    const f = fixture(); await f.session.setAccount("A");
    let release!: (value: ReturnType<typeof request>[]) => void;
    const load = new Promise<ReturnType<typeof request>[]>(r => { release = r; });
    const syncing = f.scheduler.sync(() => load); await Promise.resolve();
    f.state.pending = [row(1), local]; f.state.deny = true;
    expect((await f.session.setAccount(null)).state).toBe("blocked");
    expect(f.port.cancel).not.toHaveBeenCalled(); release([request(3)]);
    expect((await syncing).acceptedIds).toEqual([]);
    f.state.deny = false; expect((await f.session.retry()).state).toBe("ready");
    expect(f.state.pending).toEqual([local]);
  });
  it("same-account restart and repeated visible retries retain existing exact schedules", async () => {
    const f = fixture(); await f.session.setAccount("A"); await f.scheduler.sync(async () => [request(1)]);
    const saved = structuredClone(f.state.pending);
    const reload = fixture(f.values); reload.state.pending = saved;
    await reload.session.setAccount("A"); await Promise.all([reload.session.retry(), reload.session.retry()]);
    expect(reload.port.cancel).not.toHaveBeenCalled(); expect(reload.port.removeDeliveredNotifications).not.toHaveBeenCalled();
    expect((await reload.scheduler.sync(async () => [request(1)])).retained).toBe(1);
    expect(reload.state.pending).toEqual(saved);
  });
  it.each([false, true])("late native scheduling after logout stays fenced/durable through success or rejection: %s", async reject => {
    const f = fixture(); await f.session.setAccount("A");
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(r => { enter = r; }), wait = new Promise<void>(r => { release = r; });
    const late = createDeviceAlarmScheduler({ ...f.port, owner,
      schedule: async ({ notifications }) => { enter(); await wait; f.state.pending.push(...notifications); f.state.delivered.push({ id: 1 }); if (reject) throw Error("lost reply"); },
      checkPermissions: async () => ({ display: "granted" }),
      prepareAlarm: async () => ({ channelId: "c", sound: "s", legacySound: false }), prepareNotification: async () => "n",
    });
    const syncing = late.sync(async () => [request(1)]).catch(() => null); await entered;
    await f.session.setAccount("B"); expect(f.journal().cleanup).toBe(true);
    expect(f.session.getStatus().canSchedule).toBe(false);
    f.port.cancel.mockRejectedValueOnce(Error("uncertain late cancellation"));
    release(); await syncing; await f.session.retry(); await f.session.retry();
    expect(f.state.pending).toEqual([]); expect(f.state.delivered).toEqual([]);
    expect(f.session.getStatus()).toMatchObject({ state: "ready", canSchedule: true });
    expect(f.journal()).toMatchObject({ account: "B", cleanup: false });
  });
  it("rapid A/B/guest boundaries serialize cleanup and cannot release the wrong account", async () => {
    const f = fixture(); const statuses: string[] = []; f.session.subscribe(s => statuses.push(s.state));
    await Promise.all([f.session.setAccount("A"), f.session.setAccount("B"), f.session.setAccount(null)]);
    await f.session.retry();
    expect(f.journal().account).toBeNull(); expect(f.session.getStatus().canSchedule).toBe(false);
    expect(statuses).toContain("cleaning");
  });
  it("a verified old receipt cannot remove a numeric ID now owned by hamrah-local", async () => {
    const values = new Map([[NATIVE_ALARM_SESSION_KEY, JSON.stringify({ version: 1, account: "A", cleanup: true, receipts: [{ id: 90, owner }] })]]);
    const f = fixture(values); f.state.pending = [local]; f.state.delivered = [{ id: 90 }];
    await f.session.setAccount(null);
    expect(f.state.pending).toEqual([local]); expect(f.state.delivered).toEqual([{ id: 90 }]);
    expect(f.port.cancel).not.toHaveBeenCalled(); expect(f.port.removeDeliveredNotifications).not.toHaveBeenCalled();
  });
  it("UI lifecycle reports bridge failures, retries on visibility/focus, and fences on stop", async () => {
    const f=fixture();native.enabled=true;Object.assign(native.port,f.port);
    const page=new EventTarget(),windowEvents=new EventTarget();
    vi.stubGlobal("document",Object.assign(page,{visibilityState:"visible"}));
    vi.stubGlobal("window",Object.assign(windowEvents,{localStorage:f.port.storage}));
    f.state.pending=[row(1),local];f.port.cancel.mockRejectedValueOnce(Error("unavailable"));
    const states:string[]=[];
    const watch=watchNativeAlarmSession("A",status=>states.push(status.state));
    // Observe the actual first lifecycle attempt, without injecting a retry yet.
    await vi.waitFor(()=>expect(states).toContain("blocked"));
    page.dispatchEvent(new Event("visibilitychange"));await watch.retry();
    expect(states.at(-1)).toBe("ready");expect(f.state.pending).toEqual([local]);
    f.state.pending.push(row(2));f.state.delivered.push({id:2});
    watch.stop();await vi.waitFor(()=>expect(f.state.pending).toEqual([local]));
    expect(f.state.delivered).toEqual([]);expect(f.journal().account).toBeNull();
    const calls=f.port.getPending.mock.calls.length;windowEvents.dispatchEvent(new Event("focus"));
    expect(f.port.getPending.mock.calls).toHaveLength(calls);
  });
});
