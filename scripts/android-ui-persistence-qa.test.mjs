import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { androidUiPersistenceQa, assertUiPersistenceHost, assertUiPersistenceReceipt, stopUiPersistenceProcess, uiPersistenceExpression } from './android-ui-persistence-qa.mjs';
import { waitUntil } from './qa-wait-until.mjs';

const packageName = 'ir.wealthos.personalagent.stable40';
const host = { ci: 'true', serial: 'emulator-5554', emulator: '1', packageName, packageDump: 'versionCode=44 minSdk=24\n flags=[ HAS_CODE ALLOW_CLEAR_USER_DATA ]' };
describe('exact release/emulator guard', () => {
  it('accepts the known non-debuggable release', () => expect(() => assertUiPersistenceHost(host)).not.toThrow());
  it.each([{ ci: undefined }, { serial: 'owner-device' }, { emulator: '0' }, { packageName: 'other.app' },
    { packageDump: host.packageDump.replace('44', '43') }, { packageDump: host.packageDump.replace('HAS_CODE', 'HAS_CODE DEBUGGABLE') },
    { packageDump: 'versionCode=44' }])('refuses unsafe or unknown hosts %j', change => expect(() => assertUiPersistenceHost({ ...host, ...change })).toThrow());
});

const app = readFileSync('mobile-shell/app.js', 'utf8');
const part = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
function fixture() {
  const existing = [{ id: 'tia-qa-upgrade-43-44-active', title: 'retained fixture', category: 'personal', priority: 'normal', done: false, deadline: null, notificationIds: [] }];
  const values = new Map([['hamrah-local-v2', JSON.stringify(existing)], ['hamrah-confirmed-local-draft-v1', 'retained draft'],
    ['tia-qa-upgrade-43-44-manifest-v1', JSON.stringify({ prefix: 'tia-qa-upgrade-43-44-', status: 'SEEDED' })]]);
  let denySave = false, submit;
  const writes = vi.fn((key, value) => { if (denySave) throw Error('private-storage-error'); values.set(key, value); });
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: writes };
  function page() {
    let open = false;
    const nodes = new Map();
    const $ = selector => {
      if (!nodes.has(selector)) nodes.set(selector, { value: '', textContent: '', disabled: false, classList: { contains: () => open } });
      return nodes.get(selector);
    };
    const form = { submitGeneration: 1, querySelector: () => $('submit'), addEventListener: (_event, handler) => { submit = handler; },
      requestSubmit: () => { void submit({ preventDefault() {} }); } };
    const document = { querySelector: selector => selector === '#task-form' ? form : $(selector),
      querySelectorAll: () => JSON.parse(values.get('hamrah-local-v2') || '[]').filter(record => !record.done && !record.archived).map(record => ({ dataset: { id: record.id } })) };
    $('[data-open-form]').click = () => { open = true; for (const id of ['#task-id', '#task-deadline', '#task-title']) $(id).value = ''; };
    $('button[data-panel="tasks"]').click = vi.fn(); $('[data-filter="all"]').click = vi.fn();
    const fields = { id: '#task-id', title: '#task-title', category: '#task-category', priority: '#task-priority', deadline: '#task-deadline' };
    const context = vm.createContext({ window: {}, document, location: { origin: 'https://localhost', pathname: '/index.html' }, localStorage,
      crypto: webcrypto, TextEncoder, Date, performance, setTimeout: (callback, ms) => ms >= 5000 ? 0 : setTimeout(callback, 0), clearTimeout,
      form, modal: $('#task-modal'), $, $$: () => [], filter: 'all', reminderOffsets: [1440, 180, 60], repeatSettings: { repeatCount: 2, repeatMinutes: 25 },
      FormData: class { get(key) { return $(fields[key]).value; } },
      reserveAlarmCancellations: (previous, next) => { expect(previous).toBeUndefined(); return next; },
      closeForm: () => { open = false; }, showPanel: vi.fn(), render: vi.fn(), storageWarning: { hidden: true }, storageFailure: vi.fn(),
      cancelNotifications: vi.fn(() => { throw Error('Undated creation must not cancel alarms'); }),
      scheduleNotification: vi.fn(() => { throw Error('Undated creation must not schedule alarms'); }) });
    context.window.top = context.window;
    context.window.Capacitor = { getPlatform: () => 'android' };
    vm.runInContext(readFileSync('mobile-shell/storage.js', 'utf8'), context);
    vm.runInContext(readFileSync('mobile-shell/domain.js', 'utf8'), context);
    context.domain = context.window.HamrahOffline;
    context.taskStore = context.window.HamrahStorage.createTaskStore(localStorage);
    context.tasks = context.taskStore.load().tasks;
    // Exercise the delivered form handler and task store, not a fake save implementation.
    vm.runInContext(part('  function saveTasks', '  function notificationId') + part('  form.addEventListener("submit"', '  async function handleListAction'), context);
    return { context, $, run: (phase, mode, receipt) => vm.runInContext(uiPersistenceExpression(phase, mode, receipt), context) };
  }
  return { values, writes, page, deny: () => { denySave = true; } };
}
const stamped = receipt => ({ ...receipt, packageName, versionCode: 44 });
describe('real bundled form handler and external cold receipt', () => {
  it.each(['home', 'immediate'])('checks the exact UI-created ID across fresh scopes: %s', async mode => {
    const f = fixture(), before = new Map(f.values), saved = stamped(await f.page().run('create', mode));
    expect(() => assertUiPersistenceReceipt(saved, mode)).not.toThrow();
    expect(saved.acknowledgement).toBe('first-observed-closed-form-and-success-notice');
    expect(saved.acknowledgedAtDeviceMs).toBeGreaterThan(0); expect(saved.ackToReportMs).toBeGreaterThanOrEqual(0);
    expect(f.writes).toHaveBeenCalledOnce(); expect(f.writes.mock.calls[0][0]).toBe('hamrah-local-v2');
    expect(JSON.parse(f.values.get('hamrah-local-v2')).filter(record => record.id !== saved.id)).toEqual(JSON.parse(before.get('hamrah-local-v2')));
    for (const [key, value] of before) if (key !== 'hamrah-local-v2') expect(f.values.get(key)).toBe(value);
    expect(await f.page().run('check', mode, saved)).toMatchObject({ passed: true, id: saved.id, recordHash: saved.recordHash, existingFixturePreserved: true });
    expect(f.writes).toHaveBeenCalledOnce();
    expect((await f.page().run('create', mode)).passed).toBe(false); expect(f.writes).toHaveBeenCalledOnce();
  });
  it.each(['absent', 'empty', 'changed', 'other-record', 'draft'])('fails %s loss/change without repair or recreating', async mutation => {
    const f = fixture(), saved = stamped(await f.page().run('create', 'immediate'));
    if (mutation === 'absent') f.values.delete('hamrah-local-v2');
    else if (mutation === 'empty') f.values.set('hamrah-local-v2', '[]');
    else if (mutation === 'draft') f.values.set('hamrah-confirmed-local-draft-v1', 'newer-private-draft');
    else {
      const records = JSON.parse(f.values.get('hamrah-local-v2'));
      records.find(record => mutation === 'changed' ? record.id === saved.id : record.id !== saved.id).title = 'newer-private-title';
      f.values.set('hamrah-local-v2', JSON.stringify(records));
    }
    const before = new Map(f.values), result = await f.page().run('check', 'immediate', saved);
    expect(result.passed).toBe(false); expect(f.values).toEqual(before); expect(f.writes).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('newer-private');
  });
  it('rejects unsuccessful storage writes instead of treating modal/display state as success', async () => {
    const f = fixture(); f.deny(); const before = new Map(f.values);
    const result = await f.page().run('create', 'home');
    expect(result).toMatchObject({ passed: false, diagnostics: { assertion: 'UI save did not acknowledge a new record' } });
    expect(f.values).toEqual(before); expect(JSON.stringify(result)).not.toContain('private-storage-error');
  });
  it('accepts canonical key reordering, but refuses forged/mismatched external receipts', async () => {
    const f = fixture(), saved = stamped(await f.page().run('create', 'home'));
    const records = JSON.parse(f.values.get('hamrah-local-v2')).map(record => Object.fromEntries(Object.entries(record).reverse()));
    f.values.set('hamrah-local-v2', JSON.stringify(records.reverse()));
    expect((await f.page().run('check', 'home', saved)).passed).toBe(true);
    for (const change of [{ passed: false }, { phase: 'check' }, { mode: 'immediate' }, { versionCode: 43 }, { id: '' }, { recordHash: 'stale' }]) {
      expect(() => assertUiPersistenceReceipt({ ...saved, ...change }, 'home')).toThrow();
    }
  });
  it('contains no direct storage write/delete, fixture cleanup, scheduling or account operation', () => {
    const source = androidUiPersistenceQa.toString();
    expect(source).not.toMatch(/\.setItem\(|\.removeItem\(|\.clear\(|\.schedule\(|fetch\(/);
    expect(source).toContain("document.querySelector('#task-form').requestSubmit()");
  });
});

describe('separate HOME and immediate stop timing', () => {
  it.each(['home', 'immediate'])('performs only its requested lifecycle: %s', async mode => {
    let time = 140;
    const adb = vi.fn(() => { time += 5; });
    const evaluate = vi.fn(async () => ({ result: { result: { value: true } } }));
    const report = await stopUiPersistenceProcess({ mode, packageName, adb, evaluate, waitUntil, requestStarted: 100, responseReceived: 130, ackToReportMs: 2, now: () => time });
    expect(report.immediateWindowMet).toBe(true); expect(report.ackToStopLowerBoundMs).toBe(mode === 'home' ? 17 : 12);
    expect(adb.mock.calls.at(-1)).toEqual(['shell', 'am', 'force-stop', packageName]);
    if (mode === 'home') { expect(adb.mock.calls[0]).toContain('KEYCODE_HOME'); expect(evaluate).toHaveBeenCalledOnce(); }
    else { expect(adb).toHaveBeenCalledOnce(); expect(evaluate).not.toHaveBeenCalled(); }
  });
  it('marks a delayed immediate stop inconclusive rather than silently claiming coverage', async () => {
    const report = await stopUiPersistenceProcess({ mode: 'immediate', packageName, adb: vi.fn(), requestStarted: 0, responseReceived: 5000, ackToReportMs: 2, now: () => 5001 });
    expect(report.immediateWindowMet).toBe(false);
  });
  it('includes six seconds inside adb in the upper bound and rejects the immediate window', async () => {
    let time = 30;
    const report = await stopUiPersistenceProcess({ mode: 'immediate', packageName,
      adb: vi.fn(() => { time += 6000; }), requestStarted: 0, responseReceived: 20, ackToReportMs: 2, now: () => time });
    expect(report).toMatchObject({ requestToStopStartedMs: 30, requestToStopUpperBoundMs: 6030,
      ackToStopLowerBoundMs: 12, ackResponseToStopMs: 6010, forceStopCommandMs: 6000, immediateWindowMet: false });
  });
  it('never force-stops when HOME visibility is not established', async () => {
    const adb = vi.fn();
    await expect(stopUiPersistenceProcess({ mode: 'home', packageName, adb, evaluate: async () => ({ result: { result: { value: false } } }),
      waitUntil: (check, message) => waitUntil(check, message, { attempts: 1 }) })).rejects.toThrow('did not hide');
    expect(adb.mock.calls).toEqual([['shell', 'input', 'keyevent', 'KEYCODE_HOME']]);
  });
});

describe('inspector receipt/stop ordering and shell placement', () => {
  const inspector = readFileSync('scripts/android-webview-inspect.mjs', 'utf8').replace(/\r\n/g, '\n');
  const start = inspector.indexOf('  // UI persistence probe:');
  const branch = inspector.slice(start, inspector.indexOf('  if (upgradePhase) {', start));
  it.each(['home', 'immediate', 'write-failure', 'assertion-failure', 'check'])('writes external evidence before any stop: %s', async mode => {
    const events = [], phase = mode === 'check' ? 'check' : 'create';
    const context = vm.createContext({ uiPersistence: ['', mode === 'home' ? 'home' : 'immediate', phase], uiReceipt: {}, packageName,
      pid: '123', pageTargets: 1, outputPath: 'probe.json', dirname: () => '.', mkdirSync() {}, socket: { close() {} }, performance,
      process: { stdout: { write() {} } }, waitUntil, uiPersistenceExpression, assertUiPersistenceReceipt() {}, adb() {},
      evaluate: async expression => ({ result: { result: { value: expression.includes(androidUiPersistenceQa.toString())
        ? { passed: mode !== 'assertion-failure', phase, diagnostics: { assertion: 'Controlled failure' } } : true } } }),
      writeFileSync: (path, _data, options) => { expect(options).toEqual({ flag: 'wx' }); if (mode === 'write-failure' && path === 'probe.json') throw Error('Disk full'); events.push(['write', path]); },
      stopUiPersistenceProcess: async () => { events.push(['stop']); return { immediateWindowMet: true }; },
    });
    const run = vm.runInContext(`(async()=>{${branch}})()`, context);
    if (mode.endsWith('failure')) await expect(run).rejects.toThrow(); else await run;
    if (mode.endsWith('failure') || phase === 'check') expect(events.some(event => event[0] === 'stop')).toBe(false);
    else { expect(events[0]).toEqual(['write', 'probe.json']); expect(events[1]).toEqual(['stop']); }
  });
  it('runs both cases after upgrade proof, before later parity, and checks original receipts', () => {
    const shell = readFileSync('scripts/android-stable-emulator-qa.sh', 'utf8');
    const start = shell.indexOf('for persistence_mode in home immediate; do');
    expect(start).toBeGreaterThan(shell.indexOf('assertUpgradeAppearanceEvidence(...'));
    expect(start).toBeGreaterThan(shell.indexOf('"upgrade-default-light"'));
    expect(start).toBeLessThan(shell.indexOf('launch_and_verify "stable-offline"'));
    const block = shell.slice(start, shell.indexOf('\n  done', start));
    expect(block).toContain('"ui-persistence-${persistence_mode}-check" "$evidence_dir/ui-${persistence_mode}-create.json"');
    expect(block).toContain('launch_and_verify "ui-${persistence_mode}-cold"');
    expect(block).not.toMatch(/sleep|install|clear|remove/);
  });
});
