import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as inputs from '../src/lib/persian-inputs';
import { dashboardUiQa } from './dashboard-ui-qa.mjs';

const app = readFileSync('mobile-shell/app.js', 'utf8');
const part = (start, end) => {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeGreaterThan(a);
  return app.slice(a, b);
};

// Minimal DOM port; actual storage, task handlers, mapping queue and dashboard
// scope/count functions execute unchanged. This is not native-device evidence.
async function fixture({ mappingDelay = 180, commitDelay = 10, blockedOpen = false, wrongCounts = false, denyCommit = false, titleCollision = false, empty = false, invalidForm = false } = {}) {
  const retained = { id: 'unrelated-fixture', title: 'retain me', category: 'personal', priority: 'normal', done: false, deadline: null };
  if (titleCollision) Object.assign(retained, { title: 'آزمون باکس personal', deadline: new Date().toISOString() });
  const values = new Map(empty ? [] : [['hamrah-local-v2', JSON.stringify([retained])]]);
  const state = { raw: empty ? null : JSON.stringify([retained]), revision: empty ? 0 : 1, ignoredClicks: [], formOpens: 0, commits: [], actions: [] };
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const nodes = new Map(), rows = new Map(); let context, submit;
  function element(id = '') {
    const classes = new Set(), listeners = new Map();
    return { id, value: '', textContent: '', disabled: false, hidden: false, dataset: {},
      classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name), toggle: () => {} },
      setAttribute(name, value) { this[name] = value; }, getAttribute(name) { return this[name] ?? null; }, focus() {},
      addEventListener: (name, handler) => listeners.set(name, handler),
      dispatchEvent(event) { listeners.get(event.type)?.(event); },
      click() { if (this.disabled) { state.ignoredClicks.push(this.dataset.action || this.id); return; } this.onclick?.(); },
    };
  }
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, element(selector.slice(1))); return nodes.get(selector); };
  const form = node('#task-form'), modal = node('#task-modal'), submitButton = node('submit');
  form.querySelector = () => submitButton;
  form.reset = () => { for (const id of ['#task-id', '#task-title', '#task-deadline']) node(id).value = ''; };
  form.addEventListener = (_event, handler) => { submit = handler; };
  form.requestSubmit = () => { if (!invalidForm) void submit({ preventDefault() {} }); };
  form.matches = selector => selector === ':invalid' && invalidForm;
  const fields = { id: '#task-id', title: '#task-title', category: '#task-category', priority: '#task-priority', deadline: '#task-deadline' };
  const overview = () => context.window.HamrahOverview;
  const visible = () => overview().selectDashboardItems(context.tasks, context.panel, context.filter);
  const summaries = () => overview().summarizeDashboardItems(overview().selectDashboardScope(context.tasks, context.panel, context.filter));
  function render() {
    rows.clear();
    for (const task of visible()) {
      const row = element(); row.dataset.id = task.id; row.textContent = task.title;
      const actions = new Map(); row.querySelector = selector => actions.get(selector.match(/data-action="([^"]+)"/)?.[1]) ?? null;
      for (const action of ['toggle', 'edit', 'delete', 'cancel-delete', ...(context.pendingDelete === task.id ? ['confirm-delete'] : [])]) {
        const button = element(); button.dataset.action = action;
        button.closest = selector => selector === '[data-id]' ? row : button;
        button.onclick = () => { state.actions.push(action); void context.handleListAction({ target: button }); };
        actions.set(action, button);
      }
      row.buttons = [...actions.values()]; rows.set(task.id, row);
    }
    context.updateTaskControls();
  }
  const document = {
    documentElement: { dataset: { taskStoreState: 'ready' } },
    querySelector(selector) {
      if (selector === '#task-form [type="submit"]') return submitButton;
      if (selector === '.overview-meeting small') return { textContent: `${summaries()[3].done} انجام‌شده` };
      if (selector.includes('[data-id="')) {
        const id = selector.match(/data-id="([^"]+)"/)[1];
        return context.tasks.find(task => task.id === id && !task.done && !task.archived) ? rows.get(id) ?? null : null;
      }
      if (selector === '[data-action="confirm-delete"]') return rows.get(context.pendingDelete)?.querySelector(selector) ?? null;
      return node(selector);
    },
    querySelectorAll(selector) {
      if (selector === '.overview-card') return summaries();
      if (selector === '.overview-card > span') return summaries().map(group => ({ textContent: group.label }));
      if (selector === '.overview-card strong') return summaries().map(group => ({ textContent: String(group.total + (wrongCounts && state.commits.length ? 1 : 0)) }));
      if (selector === '#task-list .item') return [...rows.values()];
      if (selector.startsWith('[data-open-form],')) return [node('[data-open-form]'), submitButton, ...[...rows.values()].flatMap(row => row.buttons)];
      return [];
    },
  };
  const bridge = { onmessage: () => {}, postMessage(raw) {
    const request = JSON.parse(raw);
    if (request.op === 'read') { this.onmessage({ data: JSON.stringify({ id: request.id, ok: true, revision: state.revision, raw: state.raw }) }); return; }
    const previous = JSON.parse(state.raw ?? '[]'), proposed = JSON.parse(request.nextRaw);
    const mapping = proposed.some(task => task.notificationSchedule && !previous.find(old => old.id === task.id)?.notificationSchedule);
    setTimeout(() => {
      if (denyCommit) { this.onmessage({ data: JSON.stringify({ id: request.id, ok: false, error: 'STORAGE' }) }); return; }
      expect(request.expectedRevision).toBe(state.revision);
      state.raw = request.nextRaw; state.revision++; state.commits.push(mapping ? 'mapping' : 'task');
      this.onmessage({ data: JSON.stringify({ id: request.id, ok: true, revision: state.revision, raw: state.raw }) });
    }, mapping ? mappingDelay : commitDelay);
  } };
  context = vm.createContext({ window: { TiaTaskStoreNative: bridge, HamrahInputs: inputs }, document, localStorage, Date, Intl,
    crypto: webcrypto, Event, setTimeout, clearTimeout, URLSearchParams,
    $: selector => document.querySelector(selector), $$: () => [], form, modal, storageWarning: element(), storageFailure: vi.fn(),
    taskControls: new Map(), taskStoreReady: true, taskStoreLoading: false, taskWriteBusy: false,
    tasks: [], panel: 'today', filter: 'all', pendingActions: new Set(), pendingDelete: '', reminderOffsets: [1440, 180, 60], repeatSettings: null, offsetLabels: {},
    cancelVoice() {}, updateManualRepeatDisclosure() {}, render,
    FormData: class { get(key) { return node(fields[key]).value; } },
    planner: {}, channelId: 'test', alarmStatus: element(), notificationId: () => 1234, ensureNotificationAccess: async () => true,
    localNotifications: { getPending: async () => ({ notifications: [] }), getDeliveredNotifications: async () => ({ notifications: [] }) },
    alarmSounds: { createDeviceAlarmScheduler: () => ({ sync: async () => ({ retained: 0, scheduled: 0 }) }) },
  });
  for (const name of ['storage', 'domain', 'content']) vm.runInContext(readFileSync(`mobile-shell/${name}.js`, 'utf8'), context);
  context.domain = context.window.HamrahOffline;
  context.taskStore = context.window.HamrahStorage.createTaskStore(localStorage);
  context.tasks = (await context.taskStore.load()).tasks;
  context.window.HamrahControls = Object.fromEntries(['date', 'time'].map(kind => [kind, (_root, value, change) => {
    const input = node(`#task-${kind}-control input`); input.value = value;
    input.addEventListener('input', () => change(kind === 'date' ? inputs.parsePersianInput(input.value) : inputs.inputDigits(input.value)));
  }]));
  vm.runInContext(part('  function updateTaskControls', '  function notificationId') +
    part('  function openForm', '  function updateManualRepeatDisclosure') +
    part('  // Keep mapping persistence', '  function taskMarkup') +
    part('  form.addEventListener("submit"', '  list.addEventListener') +
    part('  function immutablePlan', '  function showAgentDraft'), context);
  const navigator = overview().createPoemNavigator(360, localStorage);
  const header = () => { node('#page-title').textContent = context.window.HamrahPoems[navigator.current()].join(''); node('#poem-next').hidden = context.panel !== 'today'; };
  context.showPanel = panel => { context.panel = panel; header(); render(); };
  for (const panel of ['today', 'tasks', 'calendar']) node(`button[data-panel="${panel}"]`).onclick = () => context.showPanel(panel);
  for (const filter of ['all', 'company']) node(`[data-filter="${filter}"]`).onclick = () => { context.filter = filter; render(); };
  node('#poem-next').onclick = () => { navigator.next(); header(); };
  node('[data-open-form]').onclick = () => { if (!blockedOpen) { state.formOpens++; context.openForm(); } };
  context.showPanel('today');
  return { state, retained, context, node, run: () => vm.runInContext(`(${dashboardUiQa.toString()})()`, context), records: () => JSON.parse(state.raw) };
}

afterEach(() => vi.useRealTimers());
describe('dashboard QA against actual async bundled handlers', () => {
  it.each([{}, { titleCollision: true }, { empty: true }])('waits for mapping commits and mutates only new IDs: %j', async options => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const f = await fixture(options); const outcome = f.run().then(value => ({ value }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(3000);
    const result = await outcome; expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({ createEditCompleteDelete: true, completedCountsOnly: true, rapidCompletion: true });
    expect(f.state.ignoredClicks).toEqual(['toggle']); // Deliberate rapid second completion only.
    expect(f.state.formOpens).toBe(3);
    expect(f.state.commits.filter(kind => kind === 'mapping')).toHaveLength(3);
    expect(f.records().find(task => task.id === f.retained.id)).toEqual(options.empty ? undefined : f.retained);
    expect(f.records().filter(task => task.done)).toHaveLength(1);
    expect(f.records().filter(task => task.archived)).toHaveLength(2);
  });
  it.each([
    [{ blockedOpen: true }, 'Create form did not open'],
    [{ denyCommit: true }, 'Dashboard task store is not writable'],
    [{ mappingDelay: 12000 }, 'Dashboard control did not become enabled'],
    [{ invalidForm: true }, 'Dashboard form is invalid'],
    [{ wrongCounts: true }, 'Created records are not reflected in scoped counts'],
  ])('keeps bounded failure and original count gates for %j', async (options, message) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const f = await fixture(options); const outcome = f.run().then(value => ({ value }), error => ({ error }));
    await vi.advanceTimersByTimeAsync(8500);
    const result = await outcome; expect(result.error?.message).toBe(message); expect(result.value).toBeUndefined();
    expect(f.records().find(task => task.id === f.retained.id)).toEqual(f.retained);
    expect(f.state.actions).toEqual([]); // Never proceed to destructive fixture actions after a failed gate.
    if (options.blockedOpen || options.denyCommit) expect(f.records()).toEqual([f.retained]);
    const diagnostics=JSON.stringify(result.error.qaDiagnostics);
    expect(diagnostics).not.toMatch(/retain me|آزمون باکس|unrelated-fixture|nextRaw/);
    if(options.denyCommit||options.invalidForm)expect(result.error.qaDiagnostics.elapsedMs).toBeLessThan(500);
  });
  it('observes a valid delayed commit without retrying or treating elapsed time as commit latency', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
    const f=await fixture({commitDelay:2500,mappingDelay:2800});
    const outcome=f.run().then(value=>({value}),error=>({error}));
    await vi.advanceTimersByTimeAsync(35000);
    const result=await outcome;
    expect(result.error).toBeUndefined();expect(result.value.submitToObservedAckMs).toHaveLength(3);
    expect(result.value.submitToObservedAckMs.every(ms=>ms>=2500&&ms<8000)).toBe(true);
    expect(f.state.formOpens).toBe(3);expect(f.state.commits.filter(kind=>kind==='mapping')).toHaveLength(3);
    expect(f.records().find(task=>task.id===f.retained.id)).toEqual(f.retained);
  });
  it('fails corrupt storage immediately without exposing its content or submitting', async () => {
    vi.useFakeTimers();const f=await fixture();
    f.context.localStorage.setItem('hamrah-local-v2','private-invalid-payload');
    const error=await f.run().catch(error=>error);
    expect(error.qaDiagnostics).toMatchObject({code:'INVALID_JSON',phase:'setup'});
    expect(JSON.stringify(error.qaDiagnostics)).not.toContain('private-invalid-payload');
    expect(f.state.formOpens).toBe(0);expect(f.state.commits).toEqual([]);
  });
});
