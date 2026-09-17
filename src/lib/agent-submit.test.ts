import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute actual checked-in handlers, not a reimplementation, with inert boundaries.
const source = ts.createSourceFile("assistant.tsx", readFileSync("src/components/agent-assistant.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let sendSource = "", voiceSource = "", actSource = "", cleanupSource = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "sendMessage") sendSource = node.getText(source);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "act") actSource = node.getText(source);
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[1]?.getText(source) === "[owner]") {
    const effect = node.arguments[0];
    if (ts.isArrowFunction(effect) && ts.isBlock(effect.body)) {
      const cleanup = effect.body.statements.find(ts.isReturnStatement)?.expression;
      if (cleanup) cleanupSource = cleanup.getText(source);
    }
  }
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "VoiceInput") {
    const attr = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === "onText");
    if (attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)) voiceSource = attr.initializer.expression!.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!sendSource || !voiceSource || !actSource || !cleanupSource) throw new Error("Actual assistant handlers missing");
const script = ts.transpileModule(`${sendSource}\n({ sendMessage, onVoice: ${voiceSource} });`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture(external = false, signedIn = true) {
  const state: Record<string, unknown> = { pending: false, needsAccount: false, mode: "local", fallbackReason: undefined };
  const data = { reply: "پیشنهاد آزمایشی", mode: external ? "online" : "local", draft: { id: "same-draft", revision: 3 }, conversationId: "same-conversation", candidates: [] };
  const network = vi.fn(async () => Response.json({ data }));
  const owner = signedIn ? "synthetic" : "guest";
  const inputValue = { current: "" };
  const context: Record<string, unknown> = {
    session: signedIn ? { user: { id: "synthetic" } } : null, pending: false, sending: { current: false }, external,
    owner, activeOwner: { current: owner }, request: { current: null }, inputValue,
    conversationId: "same-conversation", draft: { id: "same-draft", revision: 2 }, fetch: network, AbortSignal, AbortController, setTimeout, clearTimeout,
  };
  for (const field of ["NeedsAccount", "Pending", "Status", "Attempted", "Reply", "Draft", "ConversationId", "Candidates", "Mode", "FallbackReason", "Input", "Edit"]) {
    context[`set${field}`] = (value: unknown) => {
      state[field[0].toLowerCase() + field.slice(1)] = value;
      if (field === "Input") inputValue.current = value as string;
    };
  }
  const handlers = vm.runInNewContext(script, context) as { sendMessage: (text: string, consent?: boolean) => Promise<void>; onVoice: (text: string) => void };
  return { ...handlers, state, network, context };
}
describe("typed and voice assistant proposal submission", () => {
  it.each([false, true])("voice follows explicit GPT consent %s and keeps the same pending draft", async consent => {
    const f = fixture(consent); f.onVoice("فردا ساعت پنج عصر جلسه با تیم فروش دارم");
    await vi.waitFor(() => expect(f.state.pending).toBe(false));
    expect(f.network).toHaveBeenCalledOnce();
    const init = (f.network.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toMatchObject({ externalConsent: consent, draftId: "same-draft", revision: 2, conversationId: "same-conversation" });
    expect(f.state.mode).toBe(consent ? "online" : "local");
  });
  it("prevents two rapid sends before React rerenders", async () => {
    const f = fixture(true);
    await Promise.all([f.sendMessage("پیام ساختگی", true), f.sendMessage("پیام ساختگی", true)]);
    expect(f.network).toHaveBeenCalledOnce();
    expect(f.context.sending).toEqual({ current: false });
    expect(f.context.request).toEqual({ current: null });
  });
  it("does not submit signed-out or blank input", async () => {
    const f = fixture(true, false); await f.sendMessage("پیام ساختگی", true); await f.sendMessage(" ", true);
    expect(f.network).not.toHaveBeenCalled(); expect(f.state.needsAccount).toBe(true);
  });
  it("releases the submit lock on network failure and retains the user's input", async () => {
    const f = fixture(); f.state.input = "متن حفظ‌شده"; f.network.mockRejectedValueOnce(new Error("connection failed"));
    await f.sendMessage("متن حفظ‌شده");
    expect(f.state.input).toBe("متن حفظ‌شده"); expect(f.context.sending).toEqual({ current: false });
    expect(f.context.request).toEqual({ current: null });
    await f.sendMessage("متن حفظ‌شده"); expect(f.network).toHaveBeenCalledTimes(2);
  });
});

const actScript = ts.transpileModule(`${actSource}\n({ act, cleanup: ${cleanupSource} });`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const receiptFile = ts.createSourceFile("device-cancellation.ts", readFileSync("src/lib/device-cancellation.ts", "utf8"), ts.ScriptTarget.Latest, true);
const receiptSource = receiptFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "cancelDeviceRemindersFromResponse")?.getText(receiptFile);
if (!receiptSource) throw new Error("Actual device cancellation handler missing");
const receiptScript = ts.transpileModule(`${receiptSource.replace(/^export\s+/, "")}\ncancelDeviceRemindersFromResponse;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function actFixture(operation = "COMPLETE") {
  const data = { message: "تغییر تأیید شد", remindersScheduled: 0, devicePending: true, meta: { cancelledDeviceReminderIds: ["owned-alarm", "owned-native"], cancelledEscalationAttemptIds: ["owned-escalation"] } };
  const draft = { id: "same-draft", revision: 3, preview: { questions: [] }, plan: { operation } };
  const state: Record<string, unknown> = { draft, pending: false, status: "" };
  const network = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ data }));
  const cancelApprovedDeviceReminders = vi.fn<(ids: string[]) => Promise<void>>(async () => {});
  const cancelNativeEscalationAlarms = vi.fn<(ids: string[]) => Promise<void>>(async () => {});
  const cancelDeviceRemindersFromResponse = vi.fn(vm.runInNewContext(receiptScript, { isNativeAndroid: () => true, cancelApprovedDeviceReminders, cancelNativeEscalationAlarms, fetch: network, Error }) as (body: unknown) => Promise<void>);
  const syncApprovedDeviceReminders = vi.fn(async () => "تنظیم گوشی انجام شد");
  const onChanged = vi.fn(async () => {});
  const request = { current: null as AbortController | null }, activeOwner = { current: "synthetic" as string | null };
  const context: Record<string, unknown> = {
    owner: "synthetic", activeOwner, request, sending: { current: false }, draft, edit: null, pending: false, voiceBusy: false,
    fetch: network, cancelDeviceRemindersFromResponse, syncApprovedDeviceReminders, onChanged,
    AbortController, setTimeout, clearTimeout, structuredClone, Error, timer: undefined,
  };
  const setters = ["Pending", "Status", "Attempted", "Draft", "Edit"].map(field => {
    const setter = vi.fn((value: unknown) => {
      const key = field[0].toLowerCase() + field.slice(1);
      state[key] = value;
      // Subsequent calls see the current render's state, including the consumed draft.
      context[key] = value;
    });
    context[`set${field}`] = setter;
    return setter;
  });
  const handlers = vm.runInNewContext(actScript, context) as { act: (action: "edit" | "confirm" | "cancel") => Promise<void>; cleanup: () => void };
  return { ...handlers, data, state, setters, network, request, activeOwner, cancelApprovedDeviceReminders, cancelNativeEscalationAlarms, cancelDeviceRemindersFromResponse, syncApprovedDeviceReminders, onChanged };
}

describe("confirmed assistant mutations consume device cancellation receipts", () => {
  it.each(["UPDATE", "COMPLETE", "DELETE"])("consumes the %s receipt before approved sync without fetching it again", async operation => {
    const f = actFixture(operation);
    await Promise.all([f.act("confirm"), f.act("confirm")]);
    expect(f.network).toHaveBeenCalledOnce();
    const [url, init] = f.network.mock.calls[0];
    expect(url).toBe("/api/agent/drafts/same-draft"); expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ action: "confirm", revision: 3, confirmed: true });
    expect(f.cancelDeviceRemindersFromResponse).toHaveBeenCalledExactlyOnceWith(f.data);
    expect(f.cancelApprovedDeviceReminders).toHaveBeenCalledExactlyOnceWith(["owned-alarm", "owned-native"]);
    expect(f.cancelNativeEscalationAlarms).toHaveBeenCalledExactlyOnceWith(["owned-escalation"]);
    expect(f.syncApprovedDeviceReminders).toHaveBeenCalledOnce(); expect(f.onChanged).toHaveBeenCalledOnce();
    expect(f.cancelApprovedDeviceReminders.mock.invocationCallOrder[0]).toBeLessThan(f.syncApprovedDeviceReminders.mock.invocationCallOrder[0]);
    expect(f.cancelNativeEscalationAlarms.mock.invocationCallOrder[0]).toBeLessThan(f.syncApprovedDeviceReminders.mock.invocationCallOrder[0]);
    expect(f.state).toMatchObject({ draft: null, pending: false }); expect(f.request.current).toBeNull();
    expect(f.state.status).toContain(f.data.message); expect(f.state.status).toContain("تنظیم گوشی انجام شد");
    await f.act("confirm"); expect(f.network).toHaveBeenCalledOnce();
  });
  it.each(["reminder", "escalation"])("warns on failed %s cancellation without retrying the successful mutation", async failed => {
    const f = actFixture();
    (failed === "reminder" ? f.cancelApprovedDeviceReminders : f.cancelNativeEscalationAlarms).mockRejectedValueOnce(new Error("synthetic native failure"));
    await f.act("confirm");
    expect(f.cancelApprovedDeviceReminders).toHaveBeenCalledOnce(); expect(f.cancelNativeEscalationAlarms).toHaveBeenCalledOnce();
    expect(f.state.status).toContain("تغییر ذخیره شد، اما لغو هشدار قبلی گوشی تأیید نشد");
    expect(f.state.status).toContain(f.data.message);
    expect(f.state).toMatchObject({ draft: null, pending: false }); expect(f.request.current).toBeNull();
    expect(f.syncApprovedDeviceReminders).toHaveBeenCalledOnce(); expect(f.onChanged).toHaveBeenCalledOnce();
    await f.act("confirm");
    expect(f.network).toHaveBeenCalledOnce(); expect(f.cancelDeviceRemindersFromResponse).toHaveBeenCalledOnce();
  });
  it.each([
    ["account", "response"], ["unmount", "response"],
    ["account", "cancellation"], ["unmount", "cancellation"],
    ["account", "sync"], ["unmount", "sync"],
  ] as const)("fences stale work after %s cleanup while awaiting %s", async (boundary, stage) => {
    const f = actFixture();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    if (stage === "response") f.network.mockImplementationOnce(async () => { await gate; return Response.json({ data: f.data }); });
    if (stage === "cancellation") f.cancelApprovedDeviceReminders.mockImplementationOnce(() => gate);
    if (stage === "sync") f.syncApprovedDeviceReminders.mockImplementationOnce(async () => { await gate; return "late native result"; });
    const pending = f.act("confirm");
    await vi.waitFor(() => expect(stage === "response" ? f.network : stage === "cancellation" ? f.cancelApprovedDeviceReminders : f.syncApprovedDeviceReminders).toHaveBeenCalledOnce());
    const oldController = f.request.current!;
    f.cleanup(); // Execute the actual owner-effect cleanup, not a replacement fence.
    expect(oldController.signal.aborted).toBe(true); expect(f.request.current).toBeNull(); expect(f.activeOwner.current).toBeNull();
    const nextController = boundary === "account" ? new AbortController() : null;
    if (boundary === "account") { f.activeOwner.current = "other-owner"; f.request.current = nextController; }
    const setterCounts = f.setters.map(setter => setter.mock.calls.length);
    release(); await pending;
    expect(f.setters.map(setter => setter.mock.calls.length)).toEqual(setterCounts);
    expect(f.request.current).toBe(nextController); expect(nextController?.signal.aborted ?? false).toBe(false);
    expect(f.cancelDeviceRemindersFromResponse).toHaveBeenCalledTimes(stage === "response" ? 0 : 1);
    expect(f.syncApprovedDeviceReminders).toHaveBeenCalledTimes(stage === "sync" ? 1 : 0);
    expect(f.onChanged).not.toHaveBeenCalled();
    await f.act("confirm"); expect(f.network).toHaveBeenCalledOnce();
  });
});
