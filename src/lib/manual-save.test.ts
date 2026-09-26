import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSubmissionController } from "./create-submission";
import { readGuestItems, saveGuestItems, type GuestItem } from "./guest-items";
import { persianParts, validTime24 } from "./persian-inputs";
import { planInstant } from "./agent-planner";
import { manualItemMoment } from "./web-calendar";

// Execute the checked-in handlers with isolated storage/network/UI boundaries.
// No copied implementation, browser dependency, application DB or generated assets.
const web = readFileSync("src/components/personal-agent-dashboard.tsx", "utf8");
const parsed = ts.createSourceFile("dashboard.tsx", web, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name: string): string {
  let result = "";
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(parsed);
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name) result = `const ${node.getText(parsed)};`;
    if (!result) ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (!result) throw new Error(`Missing tested handler: ${name}`);
  return result;
}
const handlerScript = ts.transpileModule(`
  ${["taskToItem", "meetingToItem", "itemMoment", "tehranIso"].map(declaration).join("\n")}
  function renderHandlers() {
    const { items, guestStorageReady, signedIn, editing, preferences, session, composer } = state;
    ${["refreshGuestItems", "commitGuestItems", "closeComposer", "save", "loadRemote"].map(declaration).join("\n")}
    return { save, closeComposer };
  }
  renderHandlers;
`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function webFixture(signedIn = true, editing: GuestItem | null = null) {
  const state = {
    signedIn, editing, preferences: null, session: signedIn ? { user: { id: "synthetic" } } : null,
    items: editing ? [editing] : [] as GuestItem[], guestStorageReady: true,
    composer: true, composerDate: "2026-09-15", view: "calendar", filter: "work",
    message: "", manualSaveSuccess: "", saving: false, loading: false,
  };
  const stored = { raw: editing ? JSON.stringify([editing]) : null as string | null, denyWrite: false };
  const localStorage = {
    getItem: () => stored.raw,
    setItem: (_key: string, value: string) => { if (stored.denyWrite) throw new Error("quota"); stored.raw = value; },
  };
  const form = { values: new Map(Object.entries({ title: "آزمون ثبت", category: editing?.category ?? "personal", priority: "normal", date: "2026-09-15", time: "09:00" })), reset: vi.fn() };
  form.reset.mockImplementation(() => form.values.clear());
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => Response.json({ data: init?.method ? { id: "created-id" } : [] }));
  const submission = { current: createSubmissionController(() => crypto.randomUUID()) };
  const cancelAfterMutation = vi.fn<(response: Response) => Promise<void>>(async () => {});
  const syncApprovedDeviceReminders = vi.fn(async () => "");
  const guestSnapshot = { current: stored.raw };
  const locks = { request: async (_name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => callback({ name: "synthetic", mode: "exclusive" }) } as unknown as Pick<LockManager, "request">;
  const context: Record<string, unknown> = {
    state, submission, guestSnapshot, fetch, localStorage, readGuestItems, crypto, cancelAfterMutation, syncApprovedDeviceReminders,
    saveGuestItems: (store: Parameters<typeof saveGuestItems>[0], items: GuestItem[], expected: string | null | undefined) => saveGuestItems(store, items, expected, locks),
    persianParts, validTime24, planInstant,
    FormData: class { constructor(private input: typeof form) {} get(key: string) { return this.input.values.get(key); } },
    useCallback: (callback: unknown) => callback,
  };
  for (const field of Object.keys(state) as (keyof typeof state)[]) {
    context[`set${field[0].toUpperCase()}${field.slice(1)}`] = (value: unknown) => {
      Object.assign(state, { [field]: typeof value === "function" ? value(state[field]) : value });
    };
  }
  const renderHandlers = vm.runInNewContext(handlerScript, context) as () => { save: (event: unknown) => Promise<void>; closeComposer: () => void };
  const submit = () => renderHandlers().save({ preventDefault: vi.fn(), currentTarget: form });
  return { state, stored, form, fetch, submission, submit, cancelAfterMutation, syncApprovedDeviceReminders, close: () => renderHandlers().closeComposer() };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("manual web save outcome", () => {
  it.each(["normal", "important", "urgent"])("keeps chosen meeting priority %s in online and guest writes", async priority => {
    const online = webFixture();
    online.form.values.set("category", "meeting"); online.form.values.set("priority", priority);
    await online.submit();
    expect(JSON.parse(String(online.fetch.mock.calls[0][1]?.body)).priority).toBe(priority.toUpperCase());
    const guest = webFixture(false);
    guest.form.values.set("category", "meeting"); guest.form.values.set("priority", priority);
    await guest.submit();
    expect(guest.state.items[0].priority).toBe(priority);
    const mapper = vm.runInNewContext(ts.transpileModule(`(${declaration("meetingToItem")})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
    expect(mapper({ id: "test", title: "جلسه", priority: priority.toUpperCase() }).priority).toBe(priority);
    expect(mapper({ id: "legacy", title: "قدیمی" }).priority).toBe("important");
    expect(web).not.toContain('name="priority" disabled={category === "meeting"}');
  });
  it.each(["personal", "work", "meeting"])("saves %s, closes the form and shows Today/all without marking completed", async category => {
    const f = webFixture(); f.form.values.set("category", category);
    await f.submit();
    expect(f.state).toMatchObject({ composer: false, view: "today", filter: "all", manualSaveSuccess: "done — ذخیره شد.", saving: false });
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toBe(category === "meeting" ? "/api/meetings" : "/api/tasks");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).not.toHaveProperty("status");
    expect(JSON.parse(init!.body as string)).not.toHaveProperty("done");
    expect(init?.headers).toHaveProperty("idempotency-key");
    expect(f.form.reset).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.state.loading).toBe(false));
    expect(f.state.manualSaveSuccess).toBe("done — ذخیره شد.");
  });

  it("keeps confirmed save feedback when refreshing the list fails", async () => {
    const f = webFixture();
    f.fetch.mockImplementation(async (_url, init) => init?.method ? Response.json({ data: {} }) : new Response(null, { status: 503 }));
    await f.submit();
    await vi.waitFor(() => expect(f.state.message).toBe("دریافت برنامه انجام نشد"));
    expect(f.state).toMatchObject({ composer: false, view: "today", manualSaveSuccess: "done — ذخیره شد." });
  });

  it("retains form and the same POST key after a lost response, and blocks rapid clicks", async () => {
    const f = webFixture();
    let fail!: (reason: Error) => void;
    f.fetch.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const pending = f.submit(); await f.submit();
    expect(f.fetch).toHaveBeenCalledOnce();
    const first = f.fetch.mock.calls[0][1]!;
    fail(new Error("response lost")); await pending;
    expect(f.state).toMatchObject({ composer: true, view: "calendar", filter: "work", manualSaveSuccess: "", saving: false });
    expect(f.form.reset).not.toHaveBeenCalled();
    expect(f.form.values.get("title")).toBe("آزمون ثبت");
    await f.submit();
    const retry = f.fetch.mock.calls[1][1]!;
    expect(retry.headers).toEqual(first.headers); expect(retry.body).toBe(first.body);
    expect(f.state.manualSaveSuccess).toBe("done — ذخیره شد.");
    expect(f.submission.current.begin()).toBeNull();
    expect(f.cancelAfterMutation).not.toHaveBeenCalled();
    expect(f.syncApprovedDeviceReminders).toHaveBeenCalledOnce();
  });

  it.each([400, 401, 409, 503])("does not announce success or reset the form on HTTP %i", async status => {
    const f = webFixture(); f.state.manualSaveSuccess = "previous save";
    f.fetch.mockResolvedValueOnce(Response.json({ error: "ثبت نشد" }, { status }));
    await f.submit();
    expect(f.state).toMatchObject({ composer: true, view: "calendar", filter: "work", message: "ثبت نشد", manualSaveSuccess: "", saving: false });
    expect(f.form.reset).not.toHaveBeenCalled();
    expect(f.submission.current.isPending()).toBe(false);
  });

  it.each(["invalid:1405/99/01", "2026-02-30"])("keeps invalid dates in the form (%s)", async date => {
    const f = webFixture(); f.form.values.set("date", date); f.state.manualSaveSuccess = "previous save";
    await f.submit();
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.form.reset).not.toHaveBeenCalled();
    expect(f.state).toMatchObject({ composer: true, manualSaveSuccess: "", view: "calendar" });
  });

  it.each(["task", "meeting"] as const)("uses PATCH for edited %s and preserves its duration without completing it", async source => {
    const f = webFixture(true, { id: "old-id", title: "قبلی", category: source === "meeting" ? "meeting" : "personal", priority: "normal", source, done: false, startsAt: "2026-09-15T05:30:00Z", endsAt: "2026-09-15T07:00:00Z" });
    await f.submit();
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toBe(`/api/${source === "meeting" ? "meetings" : "tasks"}/old-id`);
    expect(init?.method).toBe("PATCH"); expect(init?.headers).not.toHaveProperty("idempotency-key");
    const body = JSON.parse(init!.body as string);
    expect(body).not.toHaveProperty("status");
    if (source === "meeting") expect(Date.parse(body.endsAt) - Date.parse(body.startsAt)).toBe(90 * 60000);
    expect(f.cancelAfterMutation).toHaveBeenCalledOnce();
    expect(f.cancelAfterMutation.mock.calls[0][0].ok).toBe(true);
    expect(f.syncApprovedDeviceReminders).toHaveBeenCalledOnce();
    expect(f.state).toMatchObject({ composer: false, view: "today", filter: "all" });
  });

  it.each(["personal", "meeting"])("persists a guest %s once and explicitly reports device-only storage", async category => {
    const f = webFixture(false); f.form.values.set("category", category);
    await Promise.all([f.submit(), f.submit()]);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.state).toMatchObject({ composer: false, view: "today", filter: "all", manualSaveSuccess: "done — فقط روی این دستگاه ذخیره شد." });
    const restored = readGuestItems({ getItem: () => f.stored.raw });
    expect(restored.ok).toBe(true); expect(restored.items).toHaveLength(1);
    expect(restored.items[0]).toMatchObject({ done: false, title: "آزمون ثبت", category });
  });

  it("preserves guest form/storage on quota failure and permits retry after space is available", async () => {
    const f = webFixture(false); f.stored.denyWrite = true;
    await f.submit();
    expect(f.state).toMatchObject({ composer: true, view: "calendar", manualSaveSuccess: "" });
    expect(f.form.reset).not.toHaveBeenCalled(); expect(f.stored.raw).toBeNull();
    f.stored.denyWrite = false; await f.submit();
    expect(readGuestItems({ getItem: () => f.stored.raw }).items).toHaveLength(1);
    expect(f.state.manualSaveSuccess).toBe("done — فقط روی این دستگاه ذخیره شد.");
  });

  it("never overwrites corrupt or unhydrated guest storage on retry", async () => {
    const f = webFixture(false); f.stored.raw = "corrupt";
    await f.submit(); await f.submit();
    expect(f.stored.raw).toBe("corrupt"); expect(f.state.manualSaveSuccess).toBe("");
    expect(f.state.composer).toBe(true); expect(f.form.reset).not.toHaveBeenCalled();
    const pending = webFixture(false); pending.state.guestStorageReady = false;
    await pending.submit(); expect(pending.stored.raw).toBeNull();
  });

  it("retains a conflicting guest form and refreshes only after explicit close", async () => {
    const f = webFixture(false);
    const other: GuestItem = { id: "other-tab", title: "saved elsewhere", source: "task", category: "personal", priority: "normal", done: false };
    f.stored.raw = JSON.stringify([other]);
    await f.submit(); await f.submit();
    expect(f.state).toMatchObject({ composer: true, saving: false, manualSaveSuccess: "" });
    expect(f.form.values.get("title")).toBe("آزمون ثبت"); expect(f.form.reset).not.toHaveBeenCalled();
    expect(f.state.message).toContain("پنجره دیگری");
    expect(readGuestItems({ getItem: () => f.stored.raw }).items).toEqual([other]);
    f.close(); expect(f.state.items).toEqual([other]);
    f.state.composer = true; f.submission.current.reset(); await f.submit();
    expect(readGuestItems({ getItem: () => f.stored.raw }).items.map(item => item.id)).toContain("other-tab");
    expect(f.state.items).toHaveLength(2);
  });

  it.each([true, false])("preserves task start, deadline and unknown guest fields on title-only edit (online=%s)", async signedIn => {
    const initial = { id: "separate-times", title: "old", source: "task", category: "personal", priority: "normal", done: false, startsAt: "2026-09-18T05:30:00.000Z", dueAt: "2026-09-18T14:30:00.000Z", legacy: "preserve" } as const;
    const f = webFixture(signedIn, initial);
    const deadline = manualItemMoment(initial)!;
    f.form.values.set("date", deadline.slice(0, 10));
    f.form.values.set("time", "18:00");
    await f.submit();
    if (signedIn) {
      const body = JSON.parse(String(f.fetch.mock.calls[0][1]?.body));
      expect(body.dueAt).toBe(initial.dueAt); expect(body).not.toHaveProperty("startAt");
    } else expect(readGuestItems({ getItem: () => f.stored.raw }).items[0]).toMatchObject({ startsAt: initial.startsAt, dueAt: initial.dueAt, legacy: "preserve" });
  });

  it.each([true, false])("does not add a deadline to a start-only task (online=%s)", async signedIn => {
    const initial: GuestItem = { id: "start-only", title: "old", source: "task", category: "personal", priority: "normal", done: false, startsAt: "2026-09-18T05:30:00.000Z" };
    const f = webFixture(signedIn, initial);
    f.form.values.set("date", manualItemMoment(initial) || ""); await f.submit();
    if (signedIn) {
      const body = JSON.parse(String(f.fetch.mock.calls[0][1]?.body));
      expect(body.dueAt).toBeNull(); expect(body).not.toHaveProperty("startAt");
    } else {
      const saved = readGuestItems({ getItem: () => f.stored.raw }).items[0];
      expect(saved.startsAt).toBe(initial.startsAt); expect(saved.dueAt).toBeUndefined();
    }
  });

  it("renders separate accessible feedback and clears its timer after five seconds/unmount", () => {
    vi.useFakeTimers();
    const effect = /useEffect\(\(\) => \{\s*if \(!manualSaveSuccess\)[\s\S]*?\}, \[manualSaveSuccess\]\);/.exec(web)![0];
    const setManualSaveSuccess = vi.fn(); let cleanup: (() => void) | undefined;
    vm.runInNewContext(effect, { manualSaveSuccess: "done — ذخیره شد.", setManualSaveSuccess, window: { setTimeout, clearTimeout }, useEffect: (run: () => () => void) => { cleanup = run(); } });
    vi.advanceTimersByTime(4999); expect(setManualSaveSuccess).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(setManualSaveSuccess).toHaveBeenCalledWith("");
    cleanup!(); expect(vi.getTimerCount()).toBe(0);
    expect(web).toMatch(/manualSaveSuccess && <p[^>]*role="status"[^>]*aria-live="polite"[^>]*>[{]manualSaveSuccess[}]<\/p>/);
  });
});

const mobile = readFileSync("mobile-shell/app.js", "utf8");
const mobileHandler = mobile.slice(mobile.indexOf('  form.addEventListener("submit"'), mobile.indexOf("  async function handleListAction"));
const storageScript = readFileSync("mobile-shell/storage.js", "utf8");
const domainScript = readFileSync("mobile-shell/domain.js", "utf8");
function mobileFixture() {
  const stored = { raw: null as string | null, denyWrite: false };
  const storage = { getItem: () => stored.raw, setItem: (_key: string, raw: string) => { if (stored.denyWrite) throw new Error("quota"); stored.raw = raw; } };
  const context = vm.createContext({ window: {} });
  vm.runInContext(storageScript, context);
  vm.runInContext(domainScript, context);
  const store = context.window.HamrahStorage.createTaskStore(storage);
  const state = { tasks: store.load().tasks, panel: "calendar", filter: "company", open: true };
  const button = { disabled: false };
  const formValues = new Map(Object.entries({ title: "ثبت آفلاین", id: "", category: "meeting", priority: "normal", deadline: "2026-09-15T09:00" }));
  const status = { textContent: "" }, errors = { textContent: "" };
  const taskId = { set value(value: string) { formValues.set("id", value); } };
  const filters = ["all", "personal", "company", "meeting"].map(filter => ({ dataset: { filter }, classList: { toggle: vi.fn() } }));
  let submit!: (event: unknown) => Promise<void>;
  const form = { submitGeneration: 0, querySelector: () => button, addEventListener: (_event: string, callback: typeof submit) => { submit = callback; } };
  const scheduleNotification = vi.fn(async () => true), cancelNotifications = vi.fn(async () => {});
  const repeatSettings = { repeatCount: 3, repeatMinutes: 15 };
  const manualRepeatPolicy = vi.spyOn(context.window.HamrahOffline, "manualRepeatPolicy");
  const saveTasks = vi.fn((next: unknown) => { if (!store.save(next).ok) { errors.textContent = "ذخیره نشد"; return false; } state.tasks = next; return true; });
  Object.assign(context, {
    form, modal: { classList: { contains: () => state.open } }, crypto, setTimeout, clearTimeout, scheduleNotification, cancelNotifications, saveTasks,
    FormData: class { get(key: string) { return formValues.get(key); } },
    $: (selector: string) => selector === "#page-status" ? status : selector === "#task-id" ? taskId : errors,
    $$: () => filters, render: vi.fn(), closeForm: () => { state.open = false; },
    showPanel: (panel: string) => { state.panel = panel; },
    domain: context.window.HamrahOffline, reminderOffsets: [1440, 180, 60], repeatSettings,
    reserveAlarmCancellations: (_previous: unknown, next: unknown) => next,
  });
  Object.assign(context.window, { HamrahInputs: { persianParts, validTime24 } });
  Object.defineProperties(context, { tasks: { get: () => state.tasks }, filter: { get: () => state.filter, set: value => { state.filter = value; } } });
  vm.runInContext(mobileHandler, context);
  return { state, stored, status, errors, button, formValues, filters, saveTasks, scheduleNotification, cancelNotifications, manualRepeatPolicy, repeatSettings, reopen: () => { state.open = true; form.submitGeneration++; button.disabled = false; }, restored: () => store.load().tasks, submit: () => submit({ preventDefault: vi.fn() }) };
}

describe("bundled manual form save", () => {
  it.each(["normal", "important", "urgent"])("retains meeting priority %s after bundled storage reload", async priority => {
    vi.useFakeTimers();
    const f = mobileFixture(); f.formValues.set("priority", priority);
    await f.submit();
    expect(f.restored()[0]).toMatchObject({ category: "meeting", priority });
  });
  it("permits the next form while the prior reminder awaits native response, without stale feedback", async () => {
    vi.useFakeTimers(); const f=mobileFixture();let finish!:(value:boolean)=>void;
    f.scheduleNotification.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const prior=f.submit();expect(f.state.open).toBe(false);expect(f.button.disabled).toBe(false);
    f.reopen();f.formValues.set("id", "");f.formValues.set("title", "ثبت بعدی");
    f.scheduleNotification.mockResolvedValueOnce(false);await f.submit();
    expect(f.restored()).toHaveLength(2);const latestNotice=f.status.textContent;
    finish(true);await prior;expect(f.status.textContent).toBe(latestNotice);
    expect(f.status.textContent).toContain("اجازه اعلان");await f.submit();expect(f.restored()).toHaveLength(2);
  });
  it("opens Today/all immediately after persistence, blocks rapid clicks and retains active records", async () => {
    vi.useFakeTimers(); const f = mobileFixture();
    let finish!: (value: boolean) => void;
    f.scheduleNotification.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.submit(); await f.submit();
    expect(f.saveTasks).toHaveBeenCalledOnce();
    expect(f.state).toMatchObject({ panel: "today", filter: "all", open: false });
    expect(f.status.textContent).toBe("done — فقط روی این دستگاه ذخیره شد.");
    expect(f.filters[0].classList.toggle).toHaveBeenCalledWith("active", true);
    finish(true); await pending;
    expect(f.restored()).toHaveLength(1); expect(f.restored()[0].done).toBe(false);
    expect(f.manualRepeatPolicy).toHaveBeenCalledWith(undefined, f.repeatSettings);
    expect(f.restored()[0].urgentRepeatPolicy).toEqual(f.repeatSettings);
    expect(f.status.textContent).toContain("یادآوری‌ها تنظیم شدند");
    vi.advanceTimersByTime(5000); expect(f.status.textContent).not.toContain("done");
    expect(f.status.textContent).toContain("فقط روی این دستگاه");
  });

  it("preserves a failed form for one successful retry and does not duplicate a repeated submit", async () => {
    vi.useFakeTimers(); const f = mobileFixture(); f.stored.denyWrite = true;
    await f.submit();
    expect(f.state).toMatchObject({ panel: "calendar", filter: "company", open: true });
    expect(f.status.textContent).not.toContain("done"); expect(f.stored.raw).toBeNull();
    expect(f.formValues.get("title")).toBe("ثبت آفلاین"); expect(f.button.disabled).toBe(false);
    expect(f.scheduleNotification).not.toHaveBeenCalled();
    f.stored.denyWrite = false; await f.submit(); await f.submit();
    expect(f.restored()).toHaveLength(1); expect(f.restored()[0].done).toBe(false);
  });

  it("preserves an existing approved plan and repeat snapshot when current defaults differ", async () => {
    vi.useFakeTimers(); const f = mobileFixture();
    await f.submit();
    const snapshot = { repeatCount: 2, repeatMinutes: 30 };
    const approvedPlan = { channels: ["ALARM"], reminderOffsets: [180], repeatCount: 1, repeatMinutes: 45, durationMinutes: 90, quietStart: "00:00", quietEnd: "00:00" };
    const existing = { ...f.restored()[0], approvedPlan, urgentRepeatPolicy: snapshot, legacySnapshot: { keep: true } };
    expect(f.saveTasks([existing])).toBe(true);
    f.repeatSettings.repeatCount = 6; f.formValues.set("title", "ویرایش"); f.reopen();
    await f.submit();
    expect(f.manualRepeatPolicy).toHaveBeenLastCalledWith(existing, f.repeatSettings);
    expect(f.restored()).toHaveLength(1);
    expect(f.restored()[0]).toMatchObject({ title: "ویرایش", done: false, approvedPlan, urgentRepeatPolicy: snapshot, legacySnapshot: { keep: true }, reminderOffsets: [180] });
    expect(Date.parse(f.restored()[0].endsAt) - Date.parse(f.restored()[0].deadline)).toBe(90 * 60000);
  });

  it("does not retroactively apply new repeat defaults to a legacy manual record", async () => {
    vi.useFakeTimers(); const f = mobileFixture(); await f.submit();
    const legacy = { ...f.restored()[0] }; delete legacy.urgentRepeatPolicy;
    expect(f.saveTasks([legacy])).toBe(true);
    f.reopen(); await f.submit();
    expect(f.restored()[0]).not.toHaveProperty("urgentRepeatPolicy");
  });

  it.each(["denied", "error"])("distinguishes saved local data from reminder %s and keeps the warning", async outcome => {
    vi.useFakeTimers(); const f = mobileFixture();
    if (outcome === "denied") f.scheduleNotification.mockResolvedValue(false);
    else f.scheduleNotification.mockRejectedValue(new Error("reminder failure"));
    await f.submit();
    expect(f.restored()).toHaveLength(1); expect(f.state.open).toBe(false);
    expect(f.status.textContent).toContain("done — فقط روی این دستگاه ذخیره شد");
    const warning = outcome === "denied" ? "اجازه اعلان" : "تنظیم یادآوری کامل نشد";
    expect(f.status.textContent).toContain(warning);
    vi.advanceTimersByTime(5000); expect(f.status.textContent).toContain(warning);
  });

  it("keeps invalid input open and reports saved edits whose cancellation still needs retry", async () => {
    vi.useFakeTimers(); const f = mobileFixture(); f.formValues.set("deadline", "invalid:T99:99");
    await f.submit(); expect(f.saveTasks).not.toHaveBeenCalled(); expect(f.state.open).toBe(true);
    f.formValues.set("deadline", "2026-09-15T09:00"); await f.submit();
    f.state.open = true; f.cancelNotifications.mockRejectedValue(new Error("cancel failed"));
    await f.submit(); expect(f.state.open).toBe(false);
    expect(f.status.textContent).toContain("تغییر ذخیره شد"); expect(f.restored()).toHaveLength(1);
    expect(f.status.textContent).toContain("لغو زنگ قبلی هنوز تأیید نشد");
  });
});
