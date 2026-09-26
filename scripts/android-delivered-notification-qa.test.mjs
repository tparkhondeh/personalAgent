import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { androidDeliveredNotificationQa, assertDeliveredQaHost } from './android-delivered-notification-qa.mjs';

// Contract tests only. Actual delivery is required separately by the emulator's native bridge.
function fixture(mode = 'success') {
  const task = { id: 'new-ui-record', title: 'tia-qa-delivered-test', done: false, notificationIds: [1, 2, 3] };
  let pending = task.notificationIds.map(id => ({ id, schedule: { at: new Date(Date.now() + 86400000) }, extra: { owner: 'hamrah-local', taskId: task.id } }));
  const existing = { id: 900, schedule: { at: new Date(Date.now() + 86400000) }, extra: { owner: 'other-owner' } };
  pending.push(existing);
  let delivered = [];
  const plugin = {
    getPending: async () => ({ notifications: structuredClone(pending) }),
    getDeliveredNotifications: async () => ({ notifications: structuredClone(delivered) }),
    createChannel: vi.fn(async () => {}),
    schedule: vi.fn(async ({ notifications }) => {
      pending = pending.filter(item => !notifications.some(next => next.id === item.id)).concat(notifications);
      if (mode !== 'never-delivered') delivered = [{ id: 1, tag: 'real-native-shape', data: {} }];
      if (mode === 'no-retained-row') pending = pending.filter(item => item.id !== 1);
    }),
    cancel: vi.fn(async ({ notifications }) => { pending = pending.filter(item => !notifications.some(next => next.id === item.id)); }),
    removeDeliveredNotifications: vi.fn(async () => { throw Error('QA must not remove the target'); }),
  };
  const complete = vi.fn(() => {
    task.done = true;
    if (!['cancel-only', 'delivered-only'].includes(mode)) pending = pending.filter(item => !task.notificationIds.includes(item.id));
    else pending = pending.filter(item => ![2, 3].includes(item.id));
    if (!['cancel-only', 'pending-only'].includes(mode)) delivered = [];
    if (mode === 'cancel-unrelated') pending = pending.filter(item => item.id === existing.id);
  });
  const row = { dataset: { id: task.id }, querySelector: () => ({ click: complete }) };
  const context = vm.createContext({ window: { Capacitor: { getPlatform: () => 'android', Plugins: { LocalNotifications: plugin } } },
    location: { origin: 'https://localhost' }, localStorage: { getItem: () => JSON.stringify([task]) },
    document: { querySelector: () => ({ click() {} }), querySelectorAll: () => task.done ? [] : [row] },
    setTimeout: callback => callback(),
  });
  return { plugin, task, existing, complete,
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
