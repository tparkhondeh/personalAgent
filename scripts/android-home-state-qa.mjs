// QA only: pure activity-dump inspection. No adb, CDP, process stop or storage mutation.
const SOURCE = 'android-activity';
const PACKAGE = 'ir.wealthos.personalagent.stable40';
const COMPONENT = `${PACKAGE}/ir.wealthos.personalagent.MainActivity`;
const MAX_SNAPSHOT_CHARS = 2 * 1024 * 1024;
const failed = reason => ({ passed: false, source: SOURCE, reason });
const canonical = component => {
  const match = component.match(/^([\w.]+)\/(\.?[\w.$]+)$/);
  if (!match) throw Error('FORMAT');
  return `${match[1]}/${match[2].startsWith('.') ? match[1] + match[2] : match[2]}`;
};
const scopeValid = scope => scope !== null && typeof scope === 'object' && scope.packageName === PACKAGE
  && ['string', 'number'].includes(typeof scope.processId)
  && /^(?:[1-9]\d*)$/.test(String(scope.processId)) && Number.isSafeInteger(Number(scope.processId));

function reference(value) {
  const match = value.match(/^ActivityRecord\{([\da-f]+) u(\d+) ([\w.$/]+) t(\d+)\}$/i);
  if (!match) throw Error('FORMAT');
  return { token: match[1], userId: Number(match[2]), component: canonical(match[3]), taskId: Number(match[4]) };
}

function field(lines, prefix, key) {
  const values = lines.filter(line => prefix.test(line)).flatMap(line =>
    [...line.matchAll(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`, 'g'))].map(match => match[1]));
  if (values.length !== 1) throw Error('FORMAT');
  return values[0];
}

function activity(record) {
  const lines = record.lines;
  const component = canonical(field(lines, /^mActivityComponent=/, 'mActivityComponent'));
  if (component !== record.component) throw Error('FORMAT');
  const state = field(lines, /^state=/, 'state');
  if (!/^(?:INITIALIZING|STARTED|RESUMED|PAUSING|PAUSED|STOPPING|STOPPED|DESTROYING|DESTROYED|RESTARTING_PROCESS)$/.test(state)) throw Error('FORMAT');
  const finishing = field(lines, /^state=/, 'finishing');
  if (!['true', 'false'].includes(finishing)) throw Error('FORMAT');
  const visibility = {};
  for (const key of ['mVisibleRequested', 'mVisible', 'mClientVisible']) {
    const value = field(lines, /^(?:mVisibleRequested|mVisible|mClientVisible)=/, key);
    if (!['true', 'false'].includes(value)) throw Error('FORMAT');
    visibility[key] = value === 'true';
  }
  const processes = lines.filter(line => /^app=/.test(line));
  if (processes.length !== 1) throw Error('FORMAT');
  const process = processes[0].match(/^app=ProcessRecord\{[\da-f]+ (\d+):([\w.]+)\/u(\d+)[\w]+\}$/i);
  if (!process || Number(process[3]) !== record.userId || process[2] !== component.split('/')[0]) throw Error('FORMAT');
  return { component, processId: Number(process[1]), userId: record.userId, displayId: record.displayId,
    taskId: record.taskId, state, finishing: finishing === 'true', ...visibility };
}

function parse(snapshot) {
  const lines = snapshot.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== 'ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)') throw Error('FORMAT');
  const displays = new Set(), records = [], resumed = [];
  let displayId;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    const display = line.match(/^Display #(\d+) \(activities from top to bottom\):$/);
    if (display) {
      displayId = Number(display[1]);
      if (displays.has(displayId)) throw Error('FORMAT');
      displays.add(displayId);
    } else if (/^Display #/.test(line)) throw Error('FORMAT');
    const top = line.match(/^\s*topResumedActivity=(.+)$/);
    if (top) {
      if (displayId === undefined) throw Error('FORMAT');
      // null is a transition, not a usable top-resumed proof.
      resumed.push({ displayId, ...(top[1] === 'null' ? { token: null } : reference(top[1])) });
    }
    if (!/^\s*\* Hist\s/.test(line)) continue;
    const header = line.match(/^(\s*)\* Hist\s+#\d+: (ActivityRecord\{.+\})$/);
    if (!header || displayId === undefined || /\t/.test(header[1])) throw Error('FORMAT');
    const indent = header[1].length;
    let end = index + 1;
    while (end < lines.length && (!lines[end].trim() || lines[end].match(/^ */)[0].length > indent)) end++;
    // Only direct fields belong to this record. Configuration/Intent strings and sibling
    // records cannot donate a state/visibility/PID to the target through a global regex.
    const body = lines.slice(index + 1, end).filter(value => value.match(/^ */)[0].length === indent + 2)
      .map(value => value.slice(indent + 2));
    records.push({ ...reference(header[2]), displayId, lines: body });
    index = end - 1;
  }
  if (!displays.has(0)) throw Error('FORMAT');
  return { records, resumed: resumed.filter(item => item.displayId === 0) };
}

export function inspectHomeActivity(snapshot, scope) {
  if (!scopeValid(scope)) return failed('HOME_INVALID_SCOPE');
  if (typeof snapshot !== 'string' || !snapshot || snapshot.length > MAX_SNAPSHOT_CHARS) return failed('HOME_SNAPSHOT_INVALID');
  try {
    const { records, resumed } = parse(snapshot);
    const matches = records.filter(record => record.component === COMPONENT);
    if (matches.length !== 1) return failed('HOME_TARGET_AMBIGUOUS');
    const target = activity(matches[0]);
    const result = { passed: false, source: SOURCE, activity: target };
    if (target.userId !== 0 || target.displayId !== 0 || target.processId !== Number(scope.processId))
      return { ...result, reason: 'HOME_TARGET_SCOPE_MISMATCH' };
    if (target.finishing || target.state !== 'STOPPED') return { ...result, reason: 'HOME_TARGET_NOT_STOPPED' };
    if (target.mVisibleRequested || target.mVisible || target.mClientVisible) return { ...result, reason: 'HOME_TARGET_VISIBLE' };
    if (resumed.length !== 1 || !resumed[0].token) return { ...result, reason: 'HOME_TOP_RESUMED_AMBIGUOUS' };
    const top = resumed[0];
    const homes = records.filter(record => record.token === top.token);
    if (homes.length !== 1) return { ...result, reason: 'HOME_TOP_RESUMED_AMBIGUOUS' };
    const homeRecord = homes[0], home = activity(homeRecord);
    if (home.userId !== 0 || home.displayId !== 0 || top.userId !== home.userId
      || top.taskId !== home.taskId || top.component !== home.component || home.component === COMPONENT)
      return { ...result, reason: 'HOME_TOP_RESUMED_MISMATCH' };
    const intents = homeRecord.lines.filter(line => /^Intent \{/.test(line));
    if (intents.length !== 1 || !/\bact=android\.intent\.action\.MAIN(?:\s|\})/.test(intents[0])
      || !intents[0].match(/\bcat=\[([^\]]*)\]/)?.[1].split(/\s+/).includes('android.intent.category.HOME')
      || canonical(intents[0].match(/\bcmp=([^\s}]+)/)?.[1] || '') !== home.component
      || field(homeRecord.lines, /^mActivityType=/, 'mActivityType') !== 'home')
      return { ...result, reason: 'HOME_INTENT_UNPROVEN' };
    if (home.finishing || home.state !== 'RESUMED') return { ...result, home, reason: 'HOME_NOT_RESUMED' };
    if (!home.mVisibleRequested || !home.mVisible || !home.mClientVisible) return { ...result, home, reason: 'HOME_NOT_VISIBLE' };
    return { passed: true, source: SOURCE, activity: target, home };
  } catch { return failed('HOME_SNAPSHOT_INVALID'); }
}

/** Returns {snapshot,result,attempts,elapsedMs}; never logs the raw snapshot.
 * readSnapshot({timeoutMs}) MUST bound its underlying adb command (especially execFileSync).
 * The deadline race also bounds async adapters; late reads never become successful evidence.
 * An optional writer is awaited before success. The caller alone owns HOME/force-stop/cold QA.
 */
export async function waitHomeActivity({ readSnapshot, writeEvidence, packageName, processId,
  now = () => performance.now(), delay = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const start = now(), deadline = start + 10_000;
  let evidence = { snapshot: null, result: failed('HOME_STATE_TIMEOUT'), attempts: 0, elapsedMs: 0 };
  const remaining = () => Math.max(0, deadline - now());
  const within = async action => {
    const budget = remaining();
    if (!Number.isFinite(budget) || budget <= 0) throw Error('DEADLINE');
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('DEADLINE')), budget);
      })]);
    } finally { clearTimeout(timer); }
  };
  if (!scopeValid({ packageName, processId }) || typeof readSnapshot !== 'function'
    || writeEvidence !== undefined && typeof writeEvidence !== 'function' || !Number.isFinite(start)) {
    return { ...evidence, result: failed('HOME_INVALID_SCOPE') };
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    if (remaining() <= 0) break;
    evidence.attempts++;
    try {
      const snapshot = await within(() => {
        const timeoutMs = Math.floor(Math.min(2000, remaining()));
        // execFileSync interprets zero as UNBOUNDED; never hand the adapter a zero/fraction.
        if (timeoutMs < 1) throw Error('DEADLINE');
        return readSnapshot({ timeoutMs });
      });
      evidence.snapshot = typeof snapshot === 'string' ? snapshot : null;
      evidence.result = inspectHomeActivity(snapshot, { packageName, processId });
    } catch {
      evidence.result = failed(remaining() <= 0 ? 'HOME_STATE_TIMEOUT' : 'HOME_DUMP_FAILED');
      break;
    }
    if (remaining() <= 0) { evidence.result = failed('HOME_STATE_TIMEOUT'); break; }
    if (evidence.result.passed || attempt === 39) break;
    try { await within(() => delay(Math.min(200, remaining()))); }
    catch { evidence.result = failed('HOME_STATE_TIMEOUT'); break; }
  }
  if (remaining() <= 0) evidence.result = failed('HOME_STATE_TIMEOUT');
  evidence.elapsedMs = Math.max(0, Math.ceil(now() - start));
  if (writeEvidence && remaining() > 0) {
    try { await within(() => writeEvidence(evidence)); }
    catch { evidence.result = failed('HOME_EVIDENCE_WRITE_FAILED'); }
    if (remaining() <= 0) evidence.result = failed('HOME_STATE_TIMEOUT');
    evidence.elapsedMs = Math.max(0, Math.ceil(now() - start));
  }
  return evidence;
}
