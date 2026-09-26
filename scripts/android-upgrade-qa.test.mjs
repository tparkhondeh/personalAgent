import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { androidUpgradeQa, assertUpgradeQaHost, assertUpgradeAppearanceEvidence } from './android-upgrade-qa.mjs';
import { waitUntil } from './qa-wait-until.mjs';

const host = { ci: 'true', serial: 'emulator-5554', emulator: '1', packageName: 'ir.wealthos.personalagent.stable40', versionCode: 43, phase: 'seed' };
describe('upgrade fixture isolation, no device or network', () => {
  it('accepts only explicit 43 seed and 44 check on a CI emulator', () => {
    expect(() => assertUpgradeQaHost(host)).not.toThrow();
    expect(() => assertUpgradeQaHost({ ...host, phase: 'check', versionCode: 44 })).not.toThrow();
  });
  it.each([{ ci: undefined }, { serial: 'owner-phone' }, { emulator: '0' }, { packageName: 'other.app' }, { versionCode: 44 }, { phase: 'other' }])('rejects unsafe host %j', change => {
    expect(() => assertUpgradeQaHost({ ...host, ...change })).toThrow('Upgrade QA requires');
  });
});

function fixture() {
  const storage = {};
  const removeItem = vi.fn(key => { delete storage[key]; });
  Object.defineProperties(storage, {
    getItem: { value: key => storage[key] ?? null },
    setItem: { value: (key, value) => { storage[key] = String(value); } },
    removeItem: { value: removeItem },
  });
  let notifications = [], sound = 'dawn';
  const schedule = vi.fn(async options => { notifications = structuredClone(options.notifications); });
  const plugin = { getPending: async () => ({ notifications }), getDeliveredNotifications: async () => ({ notifications: [] }),
    checkPermissions: async () => ({ display: 'granted' }), checkExactNotificationSetting: async () => ({ exact_alarm: 'granted' }),
    createChannel: vi.fn(async () => {}), schedule };
  const sounds = { getSelection: async () => ({ soundId: sound }), setSelection: vi.fn(async value => { sound = value.soundId; }) };
  const element = { click() {}, value: '2', textContent: '۱' };
  const document = { documentElement: { dataset: { theme: 'light' } }, querySelectorAll: () => [{}, {}], querySelector: selector => {
    if (selector.includes('[data-id=')) return null;
    if (selector === '.overview-all strong') return { textContent: '۲' };
    if (selector === '#urgent-repeat-minutes') return { value: '25' };
    return element;
  } };
  function freshPage() {
    const context = vm.createContext({ window: {}, document, location: { origin: 'https://localhost' }, localStorage: storage,
      sessionStorage: { getItem: () => null }, crypto: webcrypto, TextEncoder, Date, Intl, setTimeout });
    vm.runInContext(readFileSync('mobile-shell/storage.js', 'utf8'), context);
    vm.runInContext(readFileSync('mobile-shell/planner.js', 'utf8'), context);
    context.window.Capacitor = { getPlatform: () => 'android', Plugins: { LocalNotifications: plugin, TiaAlarmSounds: sounds } };
    context.window.HamrahAppearance = { set: value => { storage.setItem('hamrah-appearance-v1', value); return true; } };
    return { context, run: (phase, report) => vm.runInContext(`(${androidUpgradeQa.toString()})(${JSON.stringify(phase)},'ci-emulator-43-to-44',${JSON.stringify(report)})`, context) };
  }
  return { storage, removeItem, plugin, schedule, sounds, freshPage };
}

describe('serialized upgrade seed/check', () => {
  it('preserves synthetic state across fresh page scopes and emits counts/hashes only', async () => {
    const f = fixture(), seeded = await f.freshPage().run('seed');
    const checked = await f.freshPage().run('check');
    expect(checked).toMatchObject({ passed: true, records: 3, completed: 1, nativeMappings: 3, storeHash: seeded.storeHash, nativeHash: seeded.nativeHash });
    expect(checked.storeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(checked)).not.toContain('title');
    expect(f.schedule).toHaveBeenCalledOnce();
    await expect(f.freshPage().run('seed')).rejects.toThrow('already attempted');
  });
  it.each(['hamrah-local-v2', 'hamrah-confirmed-local-draft-v1', 'hamrah-appearance-v1', 'unrelated-private-key'])('refuses existing %s before any write or bridge mutation', async key => {
    const f = fixture(); f.storage[key] = 'private-sentinel';
    const before = JSON.stringify(f.storage);
    await expect(f.freshPage().run('seed')).rejects.toThrow();
    expect(JSON.stringify(f.storage)).toBe(before); expect(f.schedule).not.toHaveBeenCalled(); expect(f.sounds.setSelection).not.toHaveBeenCalled();
  });
  it('fails on missing marker or changed data without repair', async () => {
    const f = fixture(); await expect(f.freshPage().run('check')).rejects.toThrow('marker missing');
    await f.freshPage().run('seed');
    f.storage['hamrah-local-v2'] = '[]';
    await expect(f.freshPage().run('check')).rejects.toThrow('changed local records');
    expect(f.storage['hamrah-local-v2']).toBe('[]'); expect(f.schedule).toHaveBeenCalledOnce();
  });
});

describe('appearance-only restoration after upgrade evidence', () => {
  const appearance = 'hamrah-appearance-v1', markerKey = 'tia-qa-upgrade-43-44-manifest-v1';
  it('restores initial absence without changing records, drafts, alarms, marker or the report', async () => {
    const f = fixture(); await f.freshPage().run('seed');
    const report = await f.freshPage().run('check'), reportBefore = JSON.stringify(report);
    const before = { ...f.storage }, pendingBefore = await f.plugin.getPending();
    expect(f.storage[appearance]).toBe('light');
    expect(f.removeItem).not.toHaveBeenCalled();
    expect(await f.freshPage().run('restore-appearance', report)).toMatchObject({ passed: true, appearanceRestored: 'absent' });
    delete before[appearance];
    expect({ ...f.storage }).toEqual(before);
    expect(f.removeItem).toHaveBeenCalledExactlyOnceWith(appearance);
    expect(await f.plugin.getPending()).toEqual(pendingBefore);
    expect(f.schedule).toHaveBeenCalledOnce(); expect(f.sounds.setSelection).toHaveBeenCalledOnce();
    expect(JSON.stringify(report)).toBe(reportBefore);
  });
  it.each([undefined, { passed: false }, { phase: 'seed' }, { storeHash: 'stale' }, { nativeHash: 'stale' }])('refuses missing or stale successful-check evidence %j', async change => {
    const f = fixture(); await f.freshPage().run('seed');
    const checked = await f.freshPage().run('check'), before = JSON.stringify(f.storage);
    await expect(f.freshPage().run('restore-appearance', change === undefined ? undefined : { ...checked, ...change })).rejects.toThrow();
    expect(JSON.stringify(f.storage)).toBe(before); expect(f.removeItem).not.toHaveBeenCalled();
  });
  it.each(['dark', 'LIGHT', null])('does not remove a changed appearance value %j', async value => {
    const f = fixture(); await f.freshPage().run('seed');
    const report = await f.freshPage().run('check');
    if (value === null) delete f.storage[appearance]; else f.storage[appearance] = value;
    const before = JSON.stringify(f.storage);
    await expect(f.freshPage().run('restore-appearance', report)).rejects.toThrow();
    expect(JSON.stringify(f.storage)).toBe(before); expect(f.removeItem).not.toHaveBeenCalled();
  });
  it.each([undefined, 'dark'])('does not remove appearance without proof of initial absence %j', async initialAppearance => {
    const f = fixture(); await f.freshPage().run('seed');
    const report = await f.freshPage().run('check');
    f.storage[markerKey] = JSON.stringify({ ...JSON.parse(f.storage[markerKey]), initialAppearance });
    const before = JSON.stringify(f.storage);
    await expect(f.freshPage().run('restore-appearance', report)).rejects.toThrow();
    expect(JSON.stringify(f.storage)).toBe(before); expect(f.removeItem).not.toHaveBeenCalled();
  });
  it.each([appearance, markerKey, 'hamrah-local-v2'])('fences a newer %s change while native checks are pending', async key => {
    const f = fixture(); await f.freshPage().run('seed');
    const report = await f.freshPage().run('check'), pending = await f.plugin.getPending();
    const newer = key === appearance ? 'dark' : key === markerKey ? f.storage[key] + ' ' : '[]';
    f.plugin.getPending = async () => { f.storage[key] = newer; return pending; };
    await expect(f.freshPage().run('restore-appearance', report)).rejects.toThrow();
    expect(f.storage[key]).toBe(newer); expect(f.removeItem).not.toHaveBeenCalled();
  });
});

// Exercise the actual serialized inspector branches without a browser, device or files written.
const inspector = readFileSync('scripts/android-webview-inspect.mjs', 'utf8').replace(/\r\n/g, '\n');
describe('upgrade inspector evidence ordering', () => {
  const branch = inspector.slice(inspector.indexOf('  if (upgradePhase) {\n    try {'), inspector.indexOf('  let lastCandidate'));
  it.each(['check', 'seed', 'write-failure', 'check-failure', 'restore-failure'])('preserves report-before-restoration ordering: %s', async mode => {
    const events = [], phase = mode === 'seed' ? 'seed' : 'check';
    const report = { passed: mode !== 'check-failure', phase };
    const context = vm.createContext({ upgradePhase: phase, androidUpgradeQa, waitUntil,
      packageName: 'ir.wealthos.personalagent.stable40', outputPath: 'upgrade-check.json',
      dirname: () => '.', mkdirSync() {}, process: { stdout: { write() {} } }, socket: { close() {} },
      writeFileSync: (path, data) => { if (mode === 'write-failure') throw Error('Disk full'); events.push(['saved', path, JSON.parse(data)]); },
      evaluate: async expression => {
        const restoring = expression.includes(")('restore-appearance',");
        if (restoring) events.push(['restore']);
        const value = restoring ? { passed: mode !== 'restore-failure', appearanceRestored: 'absent' } : expression.includes(androidUpgradeQa.toString()) ? report : true;
        return { result: { result: { value } } };
      },
    });
    const run = vm.runInContext(`(async()=>{${branch}})()`, context);
    if (mode.endsWith('failure')) await expect(run).rejects.toThrow(); else await run;
    if (mode === 'check' || mode === 'restore-failure') {
      expect(events[0]).toEqual(['saved', 'upgrade-check.json', { ...report, packageName: 'ir.wealthos.personalagent.stable40', versionCode: 44 }]);
      expect(events[1]).toEqual(['restore']);
      expect(events.filter(event => event[0] === 'saved' && event[1] === 'upgrade-check.json')).toHaveLength(1);
      if (mode === 'restore-failure') expect(events).toHaveLength(2);
    } else expect(events.some(event => event[0] === 'restore')).toBe(false);
  });
});

describe('archived deletion postcondition', () => {
  const deletion = inspector.slice(inspector.indexOf('const internal=')).match(/await waitUntil\(([\s\S]*?),'In-app test deletion did not finish'\);/)[0];
  it.each([
    { records: [{ id: 'fixture', archived: true }], active: [], passes: true },
    { records: [], active: [], passes: false },
    { records: [{ id: 'fixture', archived: false }], active: [], passes: false },
    { records: [{ id: 'fixture', archived: true }], active: [{ dataset: { id: 'fixture' } }], passes: false },
    { records: [{ id: 'fixture', archived: true }], active: [{ dataset: { id: 'fixture' } }], panel: '#dated-list', passes: false },
    { records: [{ id: 'fixture', archived: true }], active: [{ dataset: { id: 'unrelated' } }], passes: true },
  ])('requires the retained archived fixture and no active row: %j', async ({ records, active, passes, panel = '#task-list' }) => {
    const context = vm.createContext({ internal: { dataset: { id: 'fixture' } },
      localStorage: { getItem: () => JSON.stringify(records) }, document: { querySelectorAll: selector => selector.includes(panel) ? active : [] },
      waitUntil: (check, message) => waitUntil(check, message, { attempts: 1 }),
    });
    const run = vm.runInContext(`(async()=>{${deletion}})()`, context);
    if (passes) await run; else await expect(run).rejects.toThrow('In-app test deletion did not finish');
  });
});

describe('native appearance reset evidence gate', () => {
  const common = { passed: true, packageName: 'ir.wealthos.personalagent.stable40', syntheticOnly: true,
    initialAppearance: null, storeHash: 'a'.repeat(64), nativeHash: 'b'.repeat(64) };
  const seed = { ...common, phase: 'seed', versionCode: 43 }, checked = { ...common, phase: 'check', versionCode: 44 };
  const restored = { passed: true, phase: 'restore-appearance', appearanceRestored: 'absent', storeHash: common.storeHash, nativeHash: common.nativeHash };
  it('requires matching saved seed, check and web-restoration results', () => {
    expect(() => assertUpgradeAppearanceEvidence(seed, checked, restored)).not.toThrow();
  });
  it.each([
    [0, { passed: false }], [0, { initialAppearance: 'light' }], [0, { versionCode: 44 }],
    [1, { storeHash: 'stale' }], [1, { phase: 'seed' }], [1, { packageName: 'other.app' }],
    [2, { passed: false }], [2, { nativeHash: 'stale' }], [2, { appearanceRestored: 'light' }],
  ])('refuses mismatched evidence packet %i %j', (index, change) => {
    const packets = [seed, checked, restored].map(packet => ({ ...packet }));
    Object.assign(packets[index], change);
    expect(() => assertUpgradeAppearanceEvidence(...packets)).toThrow();
  });
  it('keeps native reset test-only and checks both absent preferences before default-light acceptance', () => {
    const runner = readFileSync('android/app/src/androidTest/java/ir/wealthos/personalagent/ReleaseQaRunner.java', 'utf8');
    const shell = readFileSync('scripts/android-stable-emulator-qa.sh', 'utf8');
    expect(runner).toContain('getSharedPreferences("hamrah_appearance", Context.MODE_PRIVATE)');
    expect(runner).toContain('"light".equals(untouched.get("theme"))');
    expect(runner).toContain('appearance.edit().remove("theme").commit()');
    expect(runner).toContain('!untouched.equals(appearance.getAll())');
    expect(runner).not.toContain('.clear()');
    expect(shell.indexOf('assertUpgradeAppearanceEvidence(...')).toBeLessThan(shell.indexOf('launch_and_verify "upgrade-default-light"'));
    expect(shell).toContain('"assert-default-light" "restore-upgrade"');
    expect(shell).toContain('"assert-default-light" "assert-absent"');
    expect(shell).toContain('grep -Fq TIA_QA_NATIVE_APPEARANCE_ABSENT');
    expect(inspector).toContain("localStorage.getItem('hamrah-appearance-v1')!==null");
  });
});
