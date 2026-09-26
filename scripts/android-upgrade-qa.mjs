// QA only: the caller verifies the baseline APK/signature and installs with -r.
// These helpers never uninstall, clear storage, call a server, or read credentials.
export function assertUpgradeQaHost({ ci, serial, emulator, packageName, versionCode, phase }) {
  if (!['seed', 'baseline-check', 'check'].includes(phase) || ci !== 'true' || !/^emulator-\d+$/.test(serial)
      || emulator !== '1' || packageName !== 'ir.wealthos.personalagent.stable40'
      || Number(versionCode) !== (phase === 'check' ? 44 : 43)) {
    throw Error('Upgrade QA requires CI, an emulator, stable40 and the exact 43/44 version');
  }
}

export function assertUpgradeBaselineEvidence(seed, baseline) {
  const packageName = 'ir.wealthos.personalagent.stable40';
  if (seed?.passed !== true || seed.phase !== 'seed' || seed.versionCode !== 43 || seed.packageName !== packageName
    || baseline?.passed !== true || baseline.phase !== 'baseline-check' || baseline.versionCode !== 43 || baseline.packageName !== packageName
    || seed.syntheticOnly !== true || baseline.syntheticOnly !== true
    || seed.initialAppearance !== null || baseline.initialAppearance !== null
    || !/^[a-f0-9]{64}$/.test(seed.storeHash) || !/^[a-f0-9]{64}$/.test(seed.nativeHash)
    || seed.storeHash !== baseline.storeHash || seed.nativeHash !== baseline.nativeHash) {
    throw Error('Upgrade requires matching saved seed and cold baseline durability evidence');
  }
}

// Host-side gate before the test-only runner may restore its native appearance fixture.
export function assertUpgradeAppearanceEvidence(seed, checked, restored) {
  const packageName = 'ir.wealthos.personalagent.stable40';
  if (seed?.passed !== true || seed.phase !== 'seed' || seed.versionCode !== 43 || seed.packageName !== packageName
    || checked?.passed !== true || checked.phase !== 'check' || checked.versionCode !== 44 || checked.packageName !== packageName
    || seed.initialAppearance !== null || checked.initialAppearance !== null
    || seed.syntheticOnly !== true || checked.syntheticOnly !== true
    || !/^[a-f0-9]{64}$/.test(seed.storeHash) || !/^[a-f0-9]{64}$/.test(seed.nativeHash)
    || seed.storeHash !== checked.storeHash || seed.nativeHash !== checked.nativeHash
    || restored?.passed !== true || restored.phase !== 'restore-appearance' || restored.appearanceRestored !== 'absent'
    || restored.storeHash !== checked.storeHash || restored.nativeHash !== checked.nativeHash) {
    throw Error('Native appearance restoration requires saved matching upgrade and web-restoration evidence');
  }
}

// Self-contained for Function.toString() into the known v43 bundled DOM.
// Check never repairs data. Appearance restoration requires its saved report.
export async function androidUpgradeQa(phase, isolation, savedReport, diagnostics = {}) {
  diagnostics.stage = 'isolation';
  // Only the literal assertion messages below may enter diagnostics, never caught errors/data.
  const assert = (condition, message) => { if (!condition) { diagnostics.assertion = message; throw Error(message); } };
  const prefix = 'tia-qa-upgrade-43-44-';
  const markerKey = prefix + 'manifest-v1';
  const taskKey = 'hamrah-local-v2', draftKey = 'hamrah-confirmed-local-draft-v1';
  const preferenceKeys = ['hamrah-local-reminders-v1', 'hamrah-local-urgent-repeats-v1', 'hamrah-appearance-v1'];
  assert(isolation === 'ci-emulator-43-to-44' && ['seed', 'baseline-check', 'check', 'restore-appearance'].includes(phase), 'Missing upgrade QA isolation');
  assert(location.origin === 'https://localhost' && window.Capacitor?.getPlatform?.() === 'android', 'Not the private Android origin');
  assert(document.querySelector('#task-form') && document.querySelector('#assistant-input')
    && window.HamrahStorage?.validTasks && window.HamrahPlanner, 'Known bundled UI not ready');
  const plugin = window.Capacitor.Plugins?.LocalNotifications;
  const sounds = window.Capacitor.Plugins?.TiaAlarmSounds;
  assert(plugin && sounds && crypto.subtle, 'Native QA capabilities unavailable');
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const snapshot = () => ({ tasks: localStorage.getItem(taskKey), draft: localStorage.getItem(draftKey),
    preferences: preferenceKeys.map(key => localStorage.getItem(key)) });
  const partHashes = async stored => ({ tasks: await hash(stored.tasks), draft: await hash(stored.draft),
    reminders: await hash(stored.preferences[0]), repeats: await hash(stored.preferences[1]), appearance: await hash(stored.preferences[2]) });
  const hashPair = (expected, actual) => ({ expected: /^[a-f0-9]{64}$/.test(expected) ? expected : null, actual });
  const pending = async () => (await plugin.getPending()).notifications.map(item => ({
    id: item.id, at: new Date(item.schedule?.at).getTime(), owner: item.extra?.owner,
    taskId: item.extra?.taskId, fixture: item.extra?.fixture,
  })).sort((a, b) => a.id - b.id);
  let marker;
  if (phase === 'seed') {
    diagnostics.stage = 'seed';
    // Refuse any existing fixture or user state. A failed/partial seed is not retried.
    assert(localStorage.getItem(markerKey) === null, 'Upgrade seed already attempted');
    const raw = localStorage.getItem(taskKey);
    assert(raw === null || raw === '[]', 'Upgrade seed requires an empty task store');
    assert(localStorage.getItem(draftKey) === null && sessionStorage.getItem('hamrah-local-compose-v1') === null,
      'Upgrade seed found an existing draft');
    assert(preferenceKeys.slice(0, 2).every(key => localStorage.getItem(key) === null), 'Upgrade seed found saved preferences');
    const initialAppearance = localStorage.getItem(preferenceKeys[2]);
    assert(initialAppearance === null, 'Upgrade seed found saved appearance');
    const harmless = new Set([taskKey, 'hamrah-appearance-v1', 'hamrah.poem.v1']);
    assert(Object.keys(localStorage).every(key => harmless.has(key)), 'Upgrade seed found unrelated storage');
    assert(!(await pending()).length && !(await plugin.getDeliveredNotifications()).notifications.length,
      'Upgrade seed found existing native notifications');
    assert((await plugin.checkPermissions()).display === 'granted', 'QA notification permission not granted');
    assert((await plugin.checkExactNotificationSetting()).exact_alarm === 'granted', 'QA alarm permission not granted');
    assert((await sounds.getSelection()).soundId === 'dawn', 'Upgrade seed found an existing sound preference');
    const at = Math.ceil(Date.now() / 60000) * 60000 + 4 * 86400000;
    const createdAt = new Date().toISOString();
    const entries = [1440, 180, 60].map((offset, index) => ({ id: 4344001 + index, at: at - offset * 60000 }));
    const tasks = [
      { id: prefix + 'active', title: prefix + 'active', category: 'personal', priority: 'normal', done: false,
        deadline: new Date(at).toISOString(), updatedAt: createdAt, reminderOffsets: [1440, 180, 60],
        notificationIds: entries.map(entry => entry.id), notificationSchedule: { version: 1, entries } },
      { id: prefix + 'meeting', title: prefix + 'meeting', category: 'meeting', priority: 'important', done: false,
        deadline: new Date(at + 3600000).toISOString(), endsAt: new Date(at + 7200000).toISOString(), updatedAt: createdAt,
        reminderOffsets: [], notificationIds: [], approvedPlan: { channels: ['IN_APP'] } },
      { id: prefix + 'completed', title: prefix + 'completed', category: 'company', priority: 'normal', done: true,
        deadline: new Date(at - 86400000).toISOString(), updatedAt: createdAt, notificationIds: [] },
    ];
    const plan = window.HamrahPlanner.planPersian('فردا ساعت ۱۸ کار آزمایش ارتقا').plan;
    assert(plan && window.HamrahStorage.validTasks(tasks), 'Synthetic fixture invalid');
    plan.title = prefix + 'draft'; plan.channels = ['IN_APP']; plan.reminderOffsets = [];
    assert(localStorage.getItem(preferenceKeys[2]) === initialAppearance, 'Appearance changed before upgrade seed');
    marker = { version: 1, prefix, origin: location.origin, status: 'PREPARING', seededAt: createdAt, initialAppearance };
    localStorage.setItem(markerKey, JSON.stringify(marker));
    localStorage.setItem(taskKey, JSON.stringify(tasks));
    localStorage.setItem(draftKey, JSON.stringify({ id: prefix + 'draft', revision: 3, status: 'PENDING', plan, questions: [] }));
    localStorage.setItem(preferenceKeys[0], JSON.stringify([1440, 180, 60]));
    localStorage.setItem(preferenceKeys[1], JSON.stringify({ repeatCount: 2, repeatMinutes: 25 }));
    assert(window.HamrahAppearance.set('light'), 'Could not persist explicit appearance');
    await sounds.setSelection({ soundId: 'chime' });
    assert((await sounds.getSelection()).soundId === 'chime', 'Native sound preference did not persist');
    await plugin.createChannel({ id: prefix + 'notifications', name: 'Synthetic upgrade QA', importance: 3 });
    const notifications = entries.map(entry => ({ id: entry.id, title: prefix + 'notification', body: prefix + 'synthetic',
      channelId: prefix + 'notifications', schedule: { at: new Date(entry.at), allowWhileIdle: true },
      extra: { owner: 'hamrah-local', taskId: tasks[0].id, fixture: prefix } }));
    await plugin.schedule({ notifications });
    const expected = entries.map(entry => ({ ...entry, owner: 'hamrah-local', taskId: tasks[0].id, fixture: prefix }));
    const native = await pending();
    assert(JSON.stringify(native) === JSON.stringify(expected), 'Synthetic native mappings were not scheduled exactly');
    const stored = snapshot();
    assert(stored.tasks === JSON.stringify(tasks) && JSON.parse(stored.draft).revision === 3, 'Synthetic store readback failed');
    marker = { ...marker, status: 'SEEDED', storeHash: await hash(stored), nativeHash: await hash(native), partHashes: await partHashes(stored), sound: 'chime' };
    localStorage.setItem(markerKey, JSON.stringify(marker));
  } else {
    diagnostics.stage = 'marker';
    const rawMarker = localStorage.getItem(markerKey);
    // Fixed booleans/enums only: never expose keys, marker contents or parser errors.
    const stored = snapshot();
    diagnostics.knownKeys = { tasks: stored.tasks !== null, draft: stored.draft !== null,
      reminders: stored.preferences[0] !== null, repeats: stored.preferences[1] !== null, appearance: stored.preferences[2] !== null };
    let parseable = true;
    try { marker = JSON.parse(rawMarker ?? 'null'); } catch { parseable = false; }
    diagnostics.marker = { present: rawMarker !== null, parseable,
      status: rawMarker === null ? 'absent' : ['PREPARING', 'SEEDED'].includes(marker?.status) ? marker.status : 'unrecognized',
      validSchema: marker?.version === 1 && marker?.prefix === prefix && marker?.origin === location.origin
        && ['PREPARING', 'SEEDED'].includes(marker?.status),
      versionMatches: marker?.version === 1, prefixMatches: marker?.prefix === prefix, originMatches: marker?.origin === location.origin };
    diagnostics.store = hashPair(marker?.storeHash, await hash(stored));
    const parts = await partHashes(stored);
    diagnostics.parts = Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, hashPair(marker?.partHashes?.[key], value)]));
    assert(marker?.version === 1 && marker.prefix === prefix && marker.origin === location.origin && marker.status === 'SEEDED',
      'Upgrade marker missing or incomplete; data loss must not be reseeded');
    diagnostics.stage = 'storage';
    diagnostics.stage = 'native-mappings';
    diagnostics.native = hashPair(marker.nativeHash, await hash(await pending()));
    diagnostics.stage = 'storage';
    assert(diagnostics.store.actual === marker.storeHash, 'Upgrade changed local records, preferences or pending draft');
    const tasks = JSON.parse(stored.tasks);
    assert(window.HamrahStorage.validTasks(tasks) && tasks.length === 3 && tasks.every(task => task.id.startsWith(prefix)), 'Fixture identity changed');
    diagnostics.stage = 'native-mappings';
    assert(diagnostics.native.actual === marker.nativeHash, 'Upgrade changed scheduled native IDs, ownership or times');
    diagnostics.stage = 'sound';
    assert((await sounds.getSelection()).soundId === marker.sound, 'Upgrade lost native sound preference');
    diagnostics.stage = 'appearance';
    assert(document.documentElement.dataset.theme === 'light', 'Upgrade lost explicit appearance');
    diagnostics.stage = 'tasks-ui';
    document.querySelector('button[data-panel="tasks"]').click();
    document.querySelector('[data-filter="all"]').click();
    const number = text => Number(text.replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)).match(/\d+/)?.[0]);
    assert(document.querySelectorAll('#task-list .item').length === 2, 'Upgrade active list count differs');
    assert(!document.querySelector(`#task-list [data-id="${prefix}completed"],#dated-list [data-id="${prefix}completed"]`), 'Completed item became active');
    diagnostics.stage = 'statistics-ui';
    assert(number(document.querySelector('.overview-all strong').textContent) === 2
      && number(document.querySelector('.overview-all small').textContent) === 1
      && number(document.querySelector('.overview-work small').textContent) === 1, 'Upgrade lost completed statistics');
    diagnostics.stage = 'repeat-preferences';
    assert(document.querySelector('#urgent-max-repeats').value === '2'
      && document.querySelector('#urgent-repeat-minutes').value === '25', 'Saved repeat preferences not loaded');
    if (phase === 'restore-appearance') {
      diagnostics.stage = 'appearance-restoration';
      assert(savedReport?.passed === true && savedReport.phase === 'check' && savedReport.syntheticOnly === true
        && savedReport.storeHash === marker.storeHash && savedReport.nativeHash === marker.nativeHash,
        'Appearance restoration requires matching successful upgrade evidence');
      assert(marker.initialAppearance === null && localStorage.getItem(preferenceKeys[2]) === 'light',
        'Appearance is not the initially absent fixture value');
      // Fence newer writes across the awaited checks; never clear or rewrite other keys.
      assert(localStorage.getItem(markerKey) === rawMarker && JSON.stringify(snapshot()) === JSON.stringify(stored),
        'Upgrade fixture changed before appearance restoration');
      localStorage.removeItem(preferenceKeys[2]);
      assert(localStorage.getItem(preferenceKeys[2]) === null, 'Fixture appearance was not removed');
      return { passed: true, phase, appearanceRestored: 'absent', storeHash: marker.storeHash, nativeHash: marker.nativeHash };
    }
  }
  return { passed: true, phase, syntheticOnly: true, records: 3, active: 2, completed: 1, drafts: 1,
    nativeMappings: 3, initialAppearance: marker.initialAppearance, storeHash: marker.storeHash, nativeHash: marker.nativeHash };
}

// Catch inside the WebView so CDP exceptionDetails cannot discard the controlled assertion.
// Unknown DOM/native errors deliberately remain generic; no raw exception text is returned.
export function upgradeQaExpression(phase, savedReport) {
  return `(async()=>{const diagnostics={};try{return await (${androidUpgradeQa.toString()})(${JSON.stringify(phase)},'ci-emulator-43-to-44',${JSON.stringify(savedReport)},diagnostics);}
    catch{return {passed:false,diagnostics:{...diagnostics,assertion:diagnostics.assertion||'Unexpected native or DOM exception'}};}})()`;
}
