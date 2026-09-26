import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { androidDeliveredNotificationQa, assertDeliveredQaHost } from './android-delivered-notification-qa.mjs';

// Contract tests only. Actual delivery is required separately by the emulator's native bridge.
function fixture(mode = 'success', withUpgradeSeed = false) {
  const now = Date.parse('2030-01-02T03:04:05.678Z');
  const task = { id: 'new-ui-record', title: 'tia-qa-delivered-test', done: false, notificationIds: [1, 2, 3] };
  let pending = task.notificationIds.map(id => ({ id, schedule: { at: new Date(now + 86400000) }, extra: { owner: 'hamrah-local', taskId: task.id } }));
  const existing = { id: 900, schedule: { at: new Date(now + 86400000) }, extra: { owner: 'other-owner' } };
  const seed = { id: 'tia-qa-upgrade-43-44-active', notificationIds: [4344001, 4344002, 4344003] };
  const seedAlarms = withUpgradeSeed ? seed.notificationIds.map((id, index) => ({ id,
    schedule: { at: new Date(Math.ceil(now / 60000) * 60000 + (3 + index) * 86400000) },
    extra: { owner: 'hamrah-local', taskId: seed.id, fixture: 'tia-qa-upgrade-43-44-' } })) : [];
  pending.push(existing, ...seedAlarms);
  let delivered = [];
  const plugin = {
    // Cap8.3 puts java.util.Date into JSONObject; Android serializes via
    // Date.toString(), with seconds but no milliseconds. Model that precision.
    getPending: async () => ({ notifications: pending.map(item => ({ ...structuredClone(item),
      schedule: { ...item.schedule, at: new Date(item.schedule.at).toUTCString() } })) }),
    getDeliveredNotifications: async () => ({ notifications: structuredClone(delivered) }),
    createChannel: vi.fn(async () => {}),
    schedule: vi.fn(async ({ notifications }) => {
      pending = pending.filter(item => !notifications.some(next => next.id === item.id)).concat(notifications);
      if (mode !== 'never-delivered') delivered = [{ id: 1, tag: 'real-native-shape', data: {} }];
      if (mode === 'no-retained-row') pending = pending.filter(item => item.id !== 1);
      if (mode === 'wrong-future') {
        const sentinel = pending.find(item => item.extra?.owner === 'tia-delivered-qa');
        sentinel.schedule.at = new Date(sentinel.schedule.at.getTime() + 1000);
      }
    }),
    cancel: vi.fn(async ({ notifications }) => {
      if (mode !== 'cleanup-retained') pending = pending.filter(item => !notifications.some(next => next.id === item.id)
        || delivered.some(shown => shown.id === item.id));
    }),
    removeDeliveredNotifications: vi.fn(async () => { throw Error('QA must not remove the target'); }),
  };
  const complete = vi.fn(() => {
    task.done = true;
    if (!['cancel-only', 'delivered-only'].includes(mode)) pending = pending.filter(item => !task.notificationIds.includes(item.id));
    else pending = pending.filter(item => ![2, 3].includes(item.id));
    if (!['cancel-only', 'pending-only'].includes(mode)) delivered = [];
    if (mode === 'cancel-unrelated') pending = pending.filter(item => item.id === existing.id);
    if (mode === 'retime-unrelated') {
      const sentinel = pending.find(item => item.extra?.owner === 'tia-delivered-qa');
      sentinel.schedule.at = new Date(sentinel.schedule.at.getTime() + 1000);
    }
  });
  const row = { dataset: { id: task.id }, querySelector: () => ({ click: complete }) };
  const context = vm.createContext({ window: { Capacitor: { getPlatform: () => 'android', Plugins: { LocalNotifications: plugin } } },
    location: { origin: 'https://localhost' }, localStorage: { getItem: () => JSON.stringify([task, ...(withUpgradeSeed ? [seed] : [])]) },
    document: { querySelector: () => ({ click() {} }), querySelectorAll: () => task.done ? [] : [row] },
    setTimeout: callback => callback(),
    Date: class extends Date { constructor(value = now) { super(value); } static now() { return now; } },
  });
  return { plugin, task, existing, complete, now, seedAlarms,
    pending: () => pending, run: () => vm.runInContext(`(${androidDeliveredNotificationQa.toString()})(${JSON.stringify(task)},'ci-emulator-delivered-qa')`, context) };
}

describe('real delivered-notification QA contract', () => {
  it('uses both native lists and completion UI, only cleans its own unrelated sentinel after success', async () => {
    const f = fixture();
    expect(await f.run()).toMatchObject({ passed: true, deliveredObserved: true, retainedNativeRowObserved: true, unrelatedPreserved: true });
    expect(f.complete).toHaveBeenCalledOnce();
    expect(f.task.done).toBe(true);
    expect(f.pending()).toEqual([f.existing]);
    expect(f.plugin.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 2147000000 }] });
    expect(f.plugin.removeDeliveredNotifications).not.toHaveBeenCalled();
  });
  it('round-trips a nonzero-ms clock through native seconds without disturbing the three prior upgrade alarms', async () => {
    const f = fixture('success', true);
    expect(f.now % 1000).not.toBe(0);
    expect(await f.run()).toMatchObject({ passed: true, unrelatedPreserved: true });
    const sentinel = f.plugin.schedule.mock.calls[0][0].notifications.find(item => item.extra.owner === 'tia-delivered-qa');
    const at = sentinel.schedule.at.getTime();
    expect(at).toBe(Math.ceil(f.now / 1000) * 1000 + 4 * 86400000);
    expect(at % 1000).toBe(0);
    expect(new Date(new Date(at).toUTCString()).getTime()).toBe(at);
    expect(f.pending()).toEqual([f.existing, ...f.seedAlarms]);
    expect(f.plugin.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 2147000000 }] });
  });
  it.each(['wrong-future', 'retime-unrelated'])('still rejects the exact unrelated timestamp changing by one second: %s', async mode => {
    const f = fixture(mode, true);
    await expect(f.run()).rejects.toThrow(mode === 'wrong-future' ? 'Unrelated future fixture was not scheduled' : 'Completion cancelled the unrelated future alarm');
    expect(f.complete).toHaveBeenCalledTimes(mode === 'wrong-future' ? 0 : 1);
    expect(f.plugin.cancel).not.toHaveBeenCalled();
  });
  it('requires its future sentinel to be absent after QA cleanup; a no-op cancel is not success', async () => {
    const f = fixture('cleanup-retained');
    await expect(f.run()).rejects.toThrow('Unrelated synthetic fixture cleanup did not finish');
    expect(f.complete).toHaveBeenCalledOnce();
    expect(f.plugin.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 2147000000 }] });
    expect(f.plugin.removeDeliveredNotifications).not.toHaveBeenCalled();
  });
  it.each(['cancel-only', 'pending-only', 'delivered-only', 'cancel-unrelated', 'never-delivered', 'no-retained-row'])('rejects %s without QA repairing the app', async mode => {
    const f = fixture(mode);
    await expect(f.run()).rejects.toThrow();
    expect(f.plugin.cancel).not.toHaveBeenCalled();
    expect(f.plugin.removeDeliveredNotifications).not.toHaveBeenCalled();
    if (['never-delivered', 'no-retained-row'].includes(mode)) expect(f.complete).not.toHaveBeenCalled();
  });
  it('is wired to actual offline parity with a bounded bridge deadline', () => {
    const source = readFileSync('scripts/android-webview-inspect.mjs', 'utf8');
    expect(source).toContain("assertDeliveredQaHost({ ci: process.env.CI");
    expect(source).toContain("(${androidDeliveredNotificationQa.toString()})(task,'ci-emulator-delivered-qa')");
    expect(source).toContain('cancellation: true, deliveredCancellation');
    expect(source).toContain('})()`,60000)');
  });
  it.each([{ ci: undefined }, { serial: 'owner-phone' }, { emulator: '0' }])('rejects non-isolated hosts %j', change => {
    expect(() => assertDeliveredQaHost({ ci: 'true', serial: 'emulator-5554', emulator: '1', ...change })).toThrow();
  });
});
