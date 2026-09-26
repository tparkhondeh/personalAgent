// QA only. Records are created through the real form, never through storage writes.
export function assertUiPersistenceHost({ ci, serial, emulator, packageName, packageDump }) {
  const flags = packageDump.match(/^\s*(?:pkgFlags|flags)=\[([^\]]*)\]/m)?.[1];
  if (ci !== 'true' || !/^emulator-\d+$/.test(serial) || emulator !== '1'
    || packageName !== 'ir.wealthos.personalagent.stable40'
    || packageDump.match(/\bversionCode=(\d+)/)?.[1] !== '44'
    || flags === undefined || !/\bHAS_CODE\b/.test(flags) || /\bDEBUGGABLE\b/.test(flags)) {
    throw Error('UI persistence QA requires the non-debuggable v44 release on an isolated CI emulator');
  }
}

export function assertUiPersistenceReceipt(receipt, mode) {
  if (!['home', 'immediate'].includes(mode) || receipt?.passed !== true || receipt.phase !== 'create'
    || receipt.mode !== mode || receipt.versionCode !== 44 || receipt.packageName !== 'ir.wealthos.personalagent.stable40'
    || !/^[a-f0-9-]{36}$/i.test(receipt.id) || !receipt.title?.startsWith(`tia-qa-ui-persistence-${mode}-`)
    || !['recordHash', 'otherRecordsHash', 'sideStateHash'].every(key => /^[a-f0-9]{64}$/.test(receipt[key]))) {
    throw Error('UI persistence check requires an external successful creation receipt');
  }
}

// No minimum delay. HOME waits only for actual hidden state; immediate never waits.
// Timing is host-side: request-to-stop is an upper bound on acknowledgement-to-stop.
export async function stopUiPersistenceProcess({ mode, packageName, adb, evaluate, waitUntil, requestStarted, responseReceived, ackToReportMs, now = () => performance.now() }) {
  if (!['home', 'immediate'].includes(mode) || packageName !== 'ir.wealthos.personalagent.stable40') throw Error('Invalid UI persistence stop scope');
  if (mode === 'home') {
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await waitUntil(async () => {
      // This is a synchronous boolean, not a page promise. Awaiting a promise
      // unnecessarily depends on microtasks in the now-backgrounded renderer.
      const result = await evaluate("Boolean(window === window.top && location.origin === 'https://localhost' && document.visibilityState === 'hidden')", 2000, false);
      if (result.error || result.result?.exceptionDetails) throw Error('UI persistence HOME visibility failed');
      return result.result?.result?.value === true;
    }, 'UI persistence HOME did not hide the page', { attempts: 40, delayMs: 50 });
  }
  const stopStarted = now();
  adb('shell', 'am', 'force-stop', packageName);
  const stopCompleted = now();
  return { mode, homeHidden: mode === 'home', requestToStopUpperBoundMs: Math.ceil(stopCompleted - requestStarted),
    requestToStopStartedMs: Math.round(stopStarted - requestStarted),
    // The process may stop during adb: invocation bounds it below, completion above.
    ackToStopLowerBoundMs: Math.floor(ackToReportMs + stopStarted - responseReceived),
    ackResponseToStopMs: Math.round(stopCompleted - responseReceived), forceStopCommandMs: Math.round(stopCompleted - stopStarted),
    // A slow host must not silently turn the immediate experiment into a settled save.
    immediateWindowMet: mode !== 'immediate' || stopCompleted - requestStarted < 4000 };
}

// Self-contained, serialized into the actual bundled WebView by the inspector.
export async function androidUiPersistenceQa(phase, mode, isolation, receipt, diagnostics = {}) {
  const assert = (condition, message) => { if (!condition) { diagnostics.assertion = message; throw Error(message); } };
  diagnostics.stage = 'isolation';
  assert(isolation === 'ci-emulator-ui-persistence-44' && ['create', 'check'].includes(phase)
    && ['home', 'immediate'].includes(mode), 'Missing UI persistence isolation');
  assert(window === window.top && location.origin === 'https://localhost' && location.pathname === '/index.html'
    && window.Capacitor?.getPlatform?.() === 'android', 'UI persistence requires the top-frame bundled Android page');
  const prefix = `tia-qa-ui-persistence-${mode}-`, taskKey = 'hamrah-local-v2';
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  const read = () => {
    const records = JSON.parse(localStorage.getItem(taskKey) || 'null');
    assert(window.HamrahStorage?.validTasks(records), 'UI persistence task store missing or invalid');
    return records;
  };
  const recordsHash = records => hash([...records].sort((a, b) => a.id.localeCompare(b.id)));
  const sideState = () => ['hamrah-confirmed-local-draft-v1', 'hamrah-local-reminders-v1', 'hamrah-local-urgent-repeats-v1',
    'hamrah-appearance-v1', 'tia-qa-upgrade-43-44-manifest-v1'].map(key => localStorage.getItem(key));
  diagnostics.stage = 'precondition';
  let records = read();
  if (phase === 'create') {
    const marker = JSON.parse(localStorage.getItem('tia-qa-upgrade-43-44-manifest-v1') || 'null');
    assert(marker?.status === 'SEEDED' && marker.prefix === 'tia-qa-upgrade-43-44-', 'UI probe requires the prior upgrade fixture');
    assert(!records.some(task => task.title.startsWith(prefix)), 'UI persistence fixture already attempted; do not recreate');
    const otherRecordsHash = await recordsHash(records), sideStateHash = await hash(sideState());
    const oldIds = new Set(records.map(task => task.id)), title = prefix + crypto.randomUUID();
    diagnostics.stage = 'form';
    document.querySelector('[data-open-form]').click();
    assert(document.querySelector('#task-modal').classList.contains('open') && document.querySelector('#task-id').value === ''
      && document.querySelector('#task-deadline').value === '', 'UI persistence expected a new undated form');
    document.querySelector('#task-title').value = title;
    document.querySelector('#task-category').value = 'company';
    document.querySelector('#task-priority').value = 'important';
    document.querySelector('#task-form').requestSubmit();
    diagnostics.stage = 'ui-acknowledgement';
    let task, acknowledgedAt, acknowledgedAtDeviceMs;
    for (let attempt = 0; attempt < 80; attempt++) {
      records = read();
      const matches = records.filter(record => record.title === title);
      assert(matches.length <= 1, 'UI persistence created duplicate records');
      task = matches[0];
      if (task && !document.querySelector('#task-modal').classList.contains('open')
        && document.querySelector('#task-id').value === task.id
        && document.querySelector('#page-status').textContent.startsWith('done — فقط روی این دستگاه ذخیره شد')) {
        acknowledgedAt = performance.now(); acknowledgedAtDeviceMs = Date.now(); break;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert(acknowledgedAt !== undefined && task && !oldIds.has(task.id), 'UI save did not acknowledge a new record');
    assert(task.category === 'company' && task.priority === 'important' && task.deadline === null && task.done === false
      && !task.archived && task.notificationIds?.length === 0, 'UI save changed reviewed fields or created an alarm');
    const recordHash = await hash(task);
    assert(await recordsHash(records.filter(record => record.id !== task.id)) === otherRecordsHash
      && await hash(sideState()) === sideStateHash, 'UI save changed existing fixture data');
    return { passed: true, phase, mode, id: task.id, title, recordHash, otherRecordsHash, sideStateHash,
      acknowledgement: 'first-observed-closed-form-and-success-notice', acknowledgedAtDeviceMs,
      ackToReportMs: Math.floor(performance.now() - acknowledgedAt) };
  }
  diagnostics.stage = 'external-receipt';
  assert(receipt?.passed === true && receipt.phase === 'create' && receipt.mode === mode
    && typeof receipt.title === 'string' && receipt.title.startsWith(prefix)
    && ['recordHash', 'otherRecordsHash', 'sideStateHash'].every(key => /^[a-f0-9]{64}$/.test(receipt[key])), 'Missing external UI creation receipt');
  diagnostics.stage = 'cold-record';
  const matching = records.filter(record => record.id === receipt.id);
  diagnostics.originalIdPresent = matching.length === 1;
  assert(matching.length === 1 && matching[0].title === receipt.title, 'Acknowledged UI record missing after cold launch');
  diagnostics.recordHash = { expected: receipt.recordHash, actual: await hash(matching[0]) };
  assert(diagnostics.recordHash.actual === receipt.recordHash, 'Acknowledged UI record changed after cold launch');
  assert(await recordsHash(records.filter(record => record.id !== receipt.id)) === receipt.otherRecordsHash
    && await hash(sideState()) === receipt.sideStateHash, 'Existing fixture data changed across UI cold launch');
  diagnostics.stage = 'cold-ui';
  document.querySelector('button[data-panel="tasks"]').click();
  document.querySelector('[data-filter="all"]').click();
  assert([...document.querySelectorAll('#task-list .item')].some(row => row.dataset.id === receipt.id), 'Persisted UI record missing from active list');
  return { passed: true, phase, mode, id: receipt.id, recordHash: receipt.recordHash, existingFixturePreserved: true };
}

export function uiPersistenceExpression(phase, mode, receipt) {
  return `(async()=>{const diagnostics={};try{return await (${androidUiPersistenceQa.toString()})(${JSON.stringify(phase)},${JSON.stringify(mode)},'ci-emulator-ui-persistence-44',${JSON.stringify(receipt)},diagnostics);}
    catch{return {passed:false,diagnostics:{...diagnostics,assertion:diagnostics.assertion||'Unexpected UI persistence exception'}};}})()`;
}
