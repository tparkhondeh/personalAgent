import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { androidUpgradeQa, upgradeQaExpression, assertUpgradeQaHost, assertUpgradeBaselineEvidence, assertUpgradeAppearanceEvidence } from './android-upgrade-qa.mjs';
import { waitUntil } from './qa-wait-until.mjs';

const host = { ci: 'true', serial: 'emulator-5554', emulator: '1', packageName: 'ir.wealthos.personalagent.stable40', versionCode: 43, phase: 'seed' };
describe('upgrade fixture isolation, no device or network', () => {
  it('accepts only explicit 43 seed and 44 check on a CI emulator', () => {
    expect(() => assertUpgradeQaHost(host)).not.toThrow();
    expect(() => assertUpgradeQaHost({ ...host, phase: 'check', versionCode: 44 })).not.toThrow();
    expect(() => assertUpgradeQaHost({ ...host, phase: 'baseline-check' })).not.toThrow();
    expect(() => assertUpgradeQaHost({ ...host, phase: 'baseline-check', versionCode: 44 })).toThrow();
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

describe('controlled upgrade failure diagnostics', () => {
  const check = f => vm.runInContext(upgradeQaExpression('check'), f.freshPage().context);
  it.each([
    ['hamrah-local-v2', 'tasks'], ['hamrah-confirmed-local-draft-v1', 'draft'],
    ['hamrah-local-reminders-v1', 'reminders'], ['hamrah-local-urgent-repeats-v1', 'repeats'], ['hamrah-appearance-v1', 'appearance'],
  ])('reports only hashes for a changed %s and never repairs it', async (key, part) => {
    const f = fixture(); await f.freshPage().run('seed');
    f.storage[key] = 'private-sentinel';
    const before = JSON.stringify(f.storage), result = await check(f);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.assertion).toBe('Upgrade changed local records, preferences or pending draft');
    expect(result.diagnostics.store.actual).not.toBe(result.diagnostics.store.expected);
    for (const [name, pair] of Object.entries(result.diagnostics.parts)) {
      expect(pair.expected).toMatch(/^[a-f0-9]{64}$/); expect(pair.actual).toMatch(/^[a-f0-9]{64}$/);
      expect(pair.actual === pair.expected).toBe(name !== part);
    }
    expect(result.diagnostics.native.actual).toBe(result.diagnostics.native.expected);
    expect(JSON.stringify(result)).not.toContain('private-sentinel');
    expect(JSON.stringify(f.storage)).toBe(before); expect(f.removeItem).not.toHaveBeenCalled();
    expect(f.schedule).toHaveBeenCalledOnce();
  });
  it('detects missing native mappings without rescheduling or weakening the check', async () => {
    const f = fixture(); await f.freshPage().run('seed');
    f.plugin.getPending = async () => ({ notifications: [] });
    const result = await check(f);
    expect(result.passed).toBe(false);
    expect(result.diagnostics.assertion).toBe('Upgrade changed scheduled native IDs, ownership or times');
    expect(result.diagnostics.native.actual).not.toBe(result.diagnostics.native.expected);
    expect(f.schedule).toHaveBeenCalledOnce(); expect(f.removeItem).not.toHaveBeenCalled();
  });
  it('does not expose native exception text', async () => {
    const f = fixture(); await f.freshPage().run('seed');
    f.plugin.getPending = async () => { throw Error('private-native-payload'); };
    const result = await check(f);
    expect(result).toMatchObject({ passed: false, diagnostics: { stage: 'native-mappings', assertion: 'Unexpected native or DOM exception' } });
    expect(JSON.stringify(result)).not.toContain('private-native-payload');
    expect(f.removeItem).not.toHaveBeenCalled();
  });
  it('keeps older seed evidence valid without inventing missing per-part expected hashes', async () => {
    const f = fixture(); await f.freshPage().run('seed');
    const key = 'tia-qa-upgrade-43-44-manifest-v1', marker = JSON.parse(f.storage[key]);
    delete marker.partHashes; f.storage[key] = JSON.stringify(marker);
    expect((await check(f)).passed).toBe(true);
    f.storage['hamrah-local-v2'] = '[]';
    const result = await check(f);
    expect(result.passed).toBe(false); expect(result.diagnostics.parts.tasks.expected).toBeNull();
  });
  it.each([
    [null, 'absent', true], ['{"status":"PREPARING"}', 'PREPARING', true],
    ['{"status":"private-marker-status"}', 'unrecognized', true], ['private-invalid-json', 'unrecognized', false],
  ])('reports missing/incomplete markers safely before any native read: %s', async (raw, status, parseable) => {
    const f = fixture(); await f.freshPage().run('seed');
    const key = 'tia-qa-upgrade-43-44-manifest-v1';
    if (raw === null) delete f.storage[key]; else f.storage[key] = raw;
    f.plugin.getPending = vi.fn(() => { throw Error('Must not reach native checks'); });
    const before = JSON.stringify(f.storage), result = await check(f);
    expect(result).toMatchObject({ passed: false, diagnostics: { stage: 'marker',
      assertion: 'Upgrade marker missing or incomplete; data loss must not be reseeded',
      marker: { present: raw !== null, status, parseable, validSchema: false },
      knownKeys: { tasks: true, draft: true, reminders: true, repeats: true, appearance: true } } });
    expect(result.diagnostics.parts.tasks.actual).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(JSON.stringify(f.storage)).toBe(before); expect(f.plugin.getPending).not.toHaveBeenCalled();
    expect(f.removeItem).not.toHaveBeenCalled(); expect(f.schedule).toHaveBeenCalledOnce();
  });
  it('distinguishes total missing storage from a missing marker alone', async () => {
    const f = fixture(), result = await check(f);
    expect(result.passed).toBe(false);
    expect(Object.values(result.diagnostics.knownKeys)).toEqual([false, false, false, false, false]);
    expect(f.schedule).not.toHaveBeenCalled(); expect(f.removeItem).not.toHaveBeenCalled();
  });
});

describe('v43 durability gate before installing v44', () => {
  it('requires the original seed hashes and does not restore appearance or mutate the fixture', async () => {
    const f = fixture(), seeded = await f.freshPage().run('seed'), before = JSON.stringify(f.storage);
    const baseline = await f.freshPage().run('baseline-check');
    const stamp = report => ({ ...report, packageName: host.packageName, versionCode: 43 });
    expect(() => assertUpgradeBaselineEvidence(stamp(seeded), stamp(baseline))).not.toThrow();
    for (const change of [{ phase: 'check' }, { versionCode: 44 }, { passed: false }, { storeHash: '0'.repeat(64) }, { nativeHash: '1'.repeat(64) }]) {
      expect(() => assertUpgradeBaselineEvidence(stamp(seeded), { ...stamp(baseline), ...change })).toThrow();
    }
    expect(JSON.stringify(f.storage)).toBe(before); expect(f.schedule).toHaveBeenCalledOnce();
    expect(f.removeItem).not.toHaveBeenCalled(); expect(f.sounds.setSelection).toHaveBeenCalledOnce();
  });
  it('fails the v43 gate on missing durable seed and never reseeds', async () => {
    const f = fixture();
    const result = await vm.runInContext(upgradeQaExpression('baseline-check'), f.freshPage().context);
    expect(result).toMatchObject({ passed: false, diagnostics: { stage: 'marker', marker: { present: false } } });
    expect(f.schedule).not.toHaveBeenCalled(); expect(Object.keys(f.storage)).toEqual([]);
  });
  it('cold-relaunches and gates baseline evidence before any candidate install, without new sleeps', () => {
    const shell = readFileSync('scripts/android-stable-emulator-qa.sh', 'utf8');
    const seed = shell.indexOf('"upgrade-seed"\n');
    const relaunch = shell.indexOf('launch_and_verify "upgrade-baseline-relaunch"');
    const check = shell.indexOf('"upgrade-baseline-check"\n', relaunch);
    const evidence = shell.indexOf('assertUpgradeBaselineEvidence(...', check);
    const install = shell.indexOf('adb install -r "$stable_apk"');
    expect(seed).toBeGreaterThan(0); expect(relaunch).toBeGreaterThan(seed);
    expect(check).toBeGreaterThan(relaunch); expect(evidence).toBeGreaterThan(check); expect(install).toBeGreaterThan(evidence);
    expect(shell.slice(seed, install)).not.toMatch(/\bsleep\s+\d/);
    expect(shell).toContain('set -Eeuo pipefail');
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
  it.each(['check', 'seed', 'baseline-check', 'write-failure', 'check-failure', 'restore-failure'])('preserves report-before-restoration ordering: %s', async mode => {
    const events = [], phase = ['seed', 'baseline-check'].includes(mode) ? mode : 'check';
    const report = { passed: mode !== 'check-failure', phase };
    const context = vm.createContext({ upgradePhase: phase, upgradeQaExpression, waitUntil,
      packageName: 'ir.wealthos.personalagent.stable40', outputPath: 'upgrade-check.json',
      dirname: () => '.', mkdirSync() {}, process: { stdout: { write() {} } }, socket: { close() {} },
      writeFileSync: (path, data) => { if (mode === 'write-failure') throw Error('Disk full'); events.push(['saved', path, JSON.parse(data)]); },
      evaluate: async expression => {
        const restoring = expression.includes(')("restore-appearance",');
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
      if (mode === 'restore-failure') expect(events[2]).toMatchObject(['saved', 'upgrade-check-failure.json', { passed: false, phase: 'restore-appearance' }]);
    } else expect(events.some(event => event[0] === 'restore')).toBe(false);
    if (mode === 'baseline-check') expect(events[0][2]).toMatchObject({ passed: true, phase: 'baseline-check', versionCode: 43 });
    if (mode === 'check-failure') {
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject(['saved', 'upgrade-check-failure.json', { passed: false, phase: 'check' }]);
    }
  });
  it('redacts CDP exceptionDetails instead of serializing native or DOM payloads', async () => {
    const events = [];
    const context = vm.createContext({ upgradePhase: 'check', upgradeQaExpression, waitUntil,
      packageName: 'ir.wealthos.personalagent.stable40', outputPath: 'upgrade-check.json',
      dirname: () => '.', mkdirSync() {}, socket: { close() {} },
      writeFileSync: (path, data) => events.push([path, JSON.parse(data)]),
      evaluate: async expression => expression.includes(androidUpgradeQa.toString())
        ? { result: { exceptionDetails: { text: 'private-cdp-payload' } } }
        : { result: { result: { value: true } } },
    });
    await expect(vm.runInContext(`(async()=>{${branch}})()`, context)).rejects.toThrow('assertions failed');
    expect(events).toEqual([['upgrade-check-failure.json', { passed: false, phase: 'check',
      packageName: 'ir.wealthos.personalagent.stable40', versionCode: 44, diagnostics: { assertion: 'WebView evaluation failed' } }]]);
    expect(JSON.stringify(events)).not.toContain('private-cdp-payload');
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
  it('uses the target UID with an empty unique QA preference file, not production preferences', () => {
    const test = readFileSync('android/app/src/androidTest/java/ir/wealthos/personalagent/ReleaseQaAppearanceTest.java', 'utf8');
    expect(test).toContain('getInstrumentation().getTargetContext()');
    expect(test).toContain('assertEquals(android.os.Process.myUid(), context.getApplicationInfo().uid)');
    expect(test).toContain('getSharedPreferences("tia_qa_appearance_" + UUID.randomUUID()');
    expect(test).toContain('assertTrue(preferences.getAll().isEmpty())');
    expect(test.indexOf('fixtureCreated = true')).toBeGreaterThan(test.indexOf('putString("unrelated", "preserve").commit()'));
    expect(test).toContain('if (!fixtureCreated) return;');
    expect(test).not.toContain('getInstrumentation().getContext()');
    expect(test).not.toContain('hamrah_appearance'); expect(test).not.toContain('.clear()');
  });
});
