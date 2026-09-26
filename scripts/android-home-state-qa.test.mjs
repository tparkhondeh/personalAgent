import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectHomeActivity, waitHomeActivity } from './android-home-state-qa.mjs';

const packageName = 'ir.wealthos.personalagent.stable40';
const component = `${packageName}/ir.wealthos.personalagent.MainActivity`;
const scope = { packageName, processId: 1234 };

// Minimal redacted shape from both API36 failure dumps: HOME resumed/visible,
// target STOPPING/invisible. Tokens, PID, launcher and all unrelated data are synthetic.
const home = `    * Hist  #1: ActivityRecord{a11 u0 qa.launcher/.Home t6}
      packageName=qa.launcher processName=qa.launcher
      app=ProcessRecord{b11 99:qa.launcher/u0a100}
      Intent { act=android.intent.action.MAIN cat=[android.intent.category.HOME] flg=0x10000100 cmp=qa.launcher/.Home (has extras) }
      mActivityComponent=qa.launcher/.Home
      state=RESUMED delayedResume=false finishing=false
      mActivityType=home
      mVisibleRequested=true mVisible=true mClientVisible=true reportedDrawn=true reportedVisible=true`;
const target = `    * Hist  #0: ActivityRecord{a22 u0 ${component} t11}
      packageName=${packageName} processName=${packageName}
      app=ProcessRecord{b22 1234:${packageName}/u0a101}
      Intent { flg=0x14000000 cmp=${component} }
      mActivityComponent=${component}
      state=STOPPING delayedResume=false finishing=false
      mActivityType=standard
      mVisibleRequested=false mVisible=false mClientVisible=false reportedDrawn=false reportedVisible=false`;
const snapshot = (app = target, launcher = home, top = 'ActivityRecord{a11 u0 qa.launcher/.Home t6}') =>
  `ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)
Display #0 (activities from top to bottom):
  * Task{c11 #6 type=home U=0 visible=true visibleRequested=true}
    topResumedActivity=${top}
${launcher}

  * Task{c22 #11 type=standard U=0 visible=false visibleRequested=false}
    mLastPausedActivity: ActivityRecord{a22 u0 ${component} t11}
${app}

  ResumedActivity: ActivityRecord{a11 u0 qa.launcher/.Home t6}
`;
const stopped = target.replace('state=STOPPING', 'state=STOPPED');
const valid = () => snapshot(stopped);

describe('strict scoped Android HOME activity evidence', () => {
  it('does not turn either observed STOPPING/invisible shape into success', () => {
    for (const pid of [1234, 5678]) {
      expect(inspectHomeActivity(snapshot().replace('1234:', `${pid}:`), { ...scope, processId: pid }))
        .toMatchObject({ passed: false, source: 'android-activity', reason: 'HOME_TARGET_NOT_STOPPED',
          activity: { state: 'STOPPING', processId: pid, mVisible: false, mVisibleRequested: false, mClientVisible: false } });
    }
  });
  it.each(['LF', 'CRLF'])('accepts only the same-snapshot STOPPED target plus resumed HOME: %s', newline => {
    const text = newline === 'CRLF' ? valid().replace(/\n/g, '\r\n') : valid();
    expect(inspectHomeActivity(text, scope)).toEqual({ passed: true, source: 'android-activity',
      activity: { component, processId: 1234, userId: 0, displayId: 0, taskId: 11, state: 'STOPPED', finishing: false,
        mVisibleRequested: false, mVisible: false, mClientVisible: false },
      home: { component: 'qa.launcher/qa.launcher.Home', processId: 99, userId: 0, displayId: 0, taskId: 6,
        state: 'RESUMED', finishing: false, mVisibleRequested: true, mVisible: true, mClientVisible: true } });
  });
  it.each(['RESUMED', 'PAUSED', 'PAUSING', 'STOPPING', 'DESTROYED'])('rejects non-STOPPED target %s', state => {
    expect(inspectHomeActivity(snapshot(stopped.replace('state=STOPPED', `state=${state}`)), scope).passed).toBe(false);
  });
  it.each(['mVisibleRequested', 'mVisible', 'mClientVisible'])('rejects visible target %s', key => {
    expect(inspectHomeActivity(snapshot(stopped.replace(`${key}=false`, `${key}=true`)), scope).reason).toBe('HOME_TARGET_VISIBLE');
  });
  it.each(['mVisibleRequested', 'mVisible', 'mClientVisible'])('requires explicit visible HOME %s', key => {
    expect(inspectHomeActivity(snapshot(stopped, home.replace(`${key}=true`, `${key}=false`)), scope).reason).toBe('HOME_NOT_VISIBLE');
  });
  it.each([
    ['wrong PID', () => valid().replace('1234:', '1235:')],
    ['other component', () => valid().replaceAll(component, `${packageName}/.MainActivity`)],
    ['other user', () => valid().replaceAll('a22 u0', 'a22 u10').replace('u0a101', 'u10a101')],
    ['other display', () => snapshot(`Display #1 (activities from top to bottom):\n${stopped}`)],
    ['duplicate target', () => snapshot(`${stopped}\n${stopped}`)],
    ['missing target', () => snapshot('')],
    ['finishing target', () => snapshot(stopped.replace('finishing=false', 'finishing=true'))],
    ['stale summary only', () => valid().replace('topResumedActivity=', 'lastResumedActivity=')],
    ['null top', () => snapshot(stopped, home, 'null')],
    ['wrong top token', () => snapshot(stopped, home, 'ActivityRecord{a33 u0 qa.launcher/.Home t6}')],
    ['wrong top task', () => snapshot(stopped, home, 'ActivityRecord{a11 u0 qa.launcher/.Home t7}')],
    ['wrong top component', () => snapshot(stopped, home, 'ActivityRecord{a11 u0 qa.other/.Home t6}')],
    ['duplicate top', () => valid().replace('    topResumedActivity=', '    topResumedActivity=ActivityRecord{a11 u0 qa.launcher/.Home t6}\n    topResumedActivity=')],
    ['duplicate home', () => snapshot(stopped, `${home}\n${home}`)],
    ['home paused', () => snapshot(stopped, home.replace('state=RESUMED', 'state=PAUSED'))],
    ['home finishing', () => snapshot(stopped, home.replace('finishing=false', 'finishing=true'))],
    ['home intent missing', () => snapshot(stopped, home.replace('android.intent.category.HOME', 'android.intent.category.DEFAULT'))],
    ['home intent prefix collision', () => snapshot(stopped, home.replace('android.intent.category.HOME', 'android.intent.category.HOME_NOT'))],
    ['home action wrong', () => snapshot(stopped, home.replace('android.intent.action.MAIN', 'android.intent.action.VIEW'))],
    ['home intent component wrong', () => snapshot(stopped, home.replace('cmp=qa.launcher/.Home', 'cmp=qa.other/.Home'))],
    ['home type wrong', () => snapshot(stopped, home.replace('mActivityType=home', 'mActivityType=standard'))],
    ['missing visibility', () => snapshot(stopped.replace('mClientVisible=false', ''))],
    ['ambiguous visibility', () => snapshot(stopped.replace('mVisible=false', 'mVisible=false mVisible=true'))],
    ['ambiguous state', () => snapshot(stopped.replace('state=STOPPED', 'state=STOPPED state=RESUMED'))],
    ['missing process', () => snapshot(stopped.replace(/      app=.*\n/, ''))],
    ['truncated record', () => snapshot(stopped.split('\n').slice(0, 4).join('\n'))],
  ])('fails closed for %s', (_label, value) => {
    const result = inspectHomeActivity(value(), scope);
    expect(result.passed).toBe(false);
    expect(result.source).toBe('android-activity');
    expect(result.reason).toMatch(/^HOME_[A-Z_]+$/);
  });
  it('does not borrow state from another record or nested configuration', () => {
    const other = stopped.replaceAll(component, 'qa.other/qa.other.Main');
    expect(inspectHomeActivity(snapshot(`${target}\n${other}`), scope).reason).toBe('HOME_TARGET_NOT_STOPPED');
    const nested = stopped.replace('      state=STOPPED delayedResume=false finishing=false',
      '      mLastReportedConfigurations:\n        state=STOPPED delayedResume=false finishing=false');
    expect(inspectHomeActivity(snapshot(nested), scope).passed).toBe(false);
  });
  it.each([null, {}, '', 'SECRET raw error', 'x'.repeat(2 * 1024 * 1024 + 1)])('rejects unknown/oversized snapshot without echo', value => {
    const result = inspectHomeActivity(value, scope);
    expect(result).toEqual({ passed: false, source: 'android-activity', reason: 'HOME_SNAPSHOT_INVALID' });
  });
  it.each([{ packageName: 'other' }, { processId: 0 }, { processId: -1 }, { processId: '1234 5678' }, { processId: 1.5 }])
    ('rejects invalid scope %j', change => expect(inspectHomeActivity(valid(), { ...scope, ...change }).reason).toBe('HOME_INVALID_SCOPE'));
  it.each([null, undefined, 12, 'scope', {}])('returns a fixed reason for malformed scope %j', value => {
    expect(inspectHomeActivity(valid(), value)).toEqual({ passed: false, source: 'android-activity', reason: 'HOME_INVALID_SCOPE' });
  });
});

describe('bounded HOME observation without a stop or success on exception', () => {
  afterEach(() => vi.useRealTimers());
  function clock() {
    let time = 0;
    return { now: () => time, add: value => { time += value; }, delay: vi.fn(async ms => { time += ms; }) };
  }
  it('reads fresh snapshots and awaits evidence writing before returning success', async () => {
    const time = clock(), events = [];
    const readSnapshot = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(valid());
    const writeEvidence = vi.fn(async evidence => { await Promise.resolve(); events.push(evidence.result.passed); });
    const evidence = await waitHomeActivity({ ...scope, ...time, readSnapshot, writeEvidence });
    expect(evidence).toMatchObject({ snapshot: valid(), result: { passed: true, source: 'android-activity' }, attempts: 2, elapsedMs: 200 });
    expect(time.delay.mock.calls).toEqual([[200]]);
    expect(readSnapshot.mock.calls).toEqual([[{ timeoutMs: 2000 }], [{ timeoutMs: 2000 }]]);
    expect(writeEvidence).toHaveBeenCalledOnce(); expect(events).toEqual([true]);
  });
  it('bounds a persistently false observation to 40 reads and 39 200ms gaps', async () => {
    const time = clock(), readSnapshot = vi.fn(async () => snapshot()), writeEvidence = vi.fn();
    const evidence = await waitHomeActivity({ ...scope, ...time, readSnapshot, writeEvidence });
    expect(evidence.result.passed).toBe(false); expect(evidence.snapshot).toBe(snapshot());
    expect(evidence.attempts).toBe(40); expect(evidence.elapsedMs).toBe(7800);
    expect(readSnapshot).toHaveBeenCalledTimes(40); expect(time.delay).toHaveBeenCalledTimes(39);
    expect(time.delay.mock.calls.every(([gap]) => gap === 200)).toBe(true);
    expect(writeEvidence).toHaveBeenCalledOnce();
  });
  it('never accepts a late successful dump and gives the adapter the remaining budget', async () => {
    const time = clock();
    const readSnapshot = vi.fn(async ({ timeoutMs }) => { expect(timeoutMs).toBeLessThanOrEqual(2000); time.add(10_000); return valid(); });
    const evidence = await waitHomeActivity({ ...scope, ...time, readSnapshot });
    expect(evidence.result).toMatchObject({ passed: false, reason: 'HOME_STATE_TIMEOUT' });
    expect(evidence.snapshot).toBe(valid()); expect(evidence.attempts).toBe(1);
  });
  it('passes only a positive integer timeout when the remaining deadline is fractional', async () => {
    const time = clock();
    const readSnapshot = vi.fn(async ({ timeoutMs }) => {
      expect(Number.isInteger(timeoutMs) && timeoutMs > 0).toBe(true);
      if (readSnapshot.mock.calls.length === 1) { time.add(9000.25); return snapshot(); }
      return valid();
    });
    const evidence = await waitHomeActivity({ ...scope, ...time, readSnapshot });
    expect(evidence.result.passed).toBe(true);
    expect(readSnapshot.mock.calls[1]).toEqual([{ timeoutMs: 799 }]);
  });
  it('bounds an asynchronous hung reader to the hard ten-second deadline', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const readSnapshot = vi.fn(() => new Promise(() => {}));
    const promise = waitHomeActivity({ ...scope, readSnapshot, now: () => Date.now() });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await promise).toMatchObject({ result: { passed: false, reason: 'HOME_STATE_TIMEOUT' }, attempts: 1, elapsedMs: 10_000 });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['read', 'delay', 'write'])('returns fixed failure when %s throws, never raw error data', async operation => {
    const time = clock(), secret = 'SECRET exception details';
    const readSnapshot = vi.fn(async () => { if (operation === 'read') throw Error(secret); return operation === 'write' ? valid() : snapshot(); });
    const evidence = await waitHomeActivity({ ...scope, ...time, readSnapshot,
      delay: operation === 'delay' ? async () => { throw Error(secret); } : time.delay,
      writeEvidence: async () => { if (operation === 'write') throw Error(secret); } });
    expect(evidence.result.passed).toBe(false);
    expect(JSON.stringify(evidence.result)).not.toContain(secret);
    expect(evidence.attempts).toBe(1);
  });
  it('does not call adapters for invalid scope', async () => {
    const readSnapshot = vi.fn(), writeEvidence = vi.fn();
    const evidence = await waitHomeActivity({ ...scope, packageName: 'other', readSnapshot, writeEvidence });
    expect(evidence.result.reason).toBe('HOME_INVALID_SCOPE');
    expect(readSnapshot).not.toHaveBeenCalled(); expect(writeEvidence).not.toHaveBeenCalled();
  });
  it('does not log raw activity data', async () => {
    const time = clock(), log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try { await waitHomeActivity({ ...scope, ...time, readSnapshot: async () => valid() }); expect(log).not.toHaveBeenCalled(); }
    finally { log.mockRestore(); }
  });
});
