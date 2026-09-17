import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimGuestDraft, offerGuestDraft, readComposeDraft, saveComposeDraft } from "./assistant-draft";

const source = ts.createSourceFile("assistant.tsx", readFileSync("src/components/agent-assistant.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name: string) {
  let found = "";
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(source);
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = `const ${node.getText(source)};`;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source); if (!found) throw Error(name); return found;
}
let cleanupEffect = "";
const findCleanup = (node: ts.Node) => {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.getText(source).includes("request.current")) cleanupEffect = node.getText(source);
  else ts.forEachChild(node, findCleanup);
};
findCleanup(source);

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, clear: () => values.clear(), getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(store = storage(), owner = "synthetic-user") {
  const request = { current: null as AbortController | null }, inputValue = { current: "first message" };
  const callbacks = Object.fromEntries(["NeedsAccount", "Pending", "Status", "Attempted", "Reply", "Draft", "ConversationId", "Candidates", "Mode", "FallbackReason", "Edit", "InputValue", "External", "Online", "VoiceBusy", "ReadyOwner"].map(name => [`set${name}`, vi.fn()]));
  const fetch = vi.fn<(...args: [string, RequestInit]) => Promise<Response>>();
  const draft = { id: "owned-draft", revision: 7, preview: { questions: [] }, plan: {} };
  let dispose!: () => void;
  let setup!: () => () => void;
  const context = {
    ...callbacks, request, inputValue, owner, activeOwner: { current: null as string | null }, fetch, AbortController,
    setTimeout: (run: () => void, delay: number) => { if (delay === 0) { run(); return 0; } return setTimeout(run, delay); }, clearTimeout,
    pending: false, sending: { current: false }, session: { user: { id: owner } }, voiceBusy: false, conversationId: "conversation", draft, edit: null,
    saveComposeDraft: (id: string, value: string) => saveComposeDraft(id, value, store),
    readComposeDraft: (id: string) => readComposeDraft(id, store), claimGuestDraft: () => claimGuestDraft(store),
    useEffect: (effect: () => () => void) => { setup = effect; dispose = effect(); },
    onChanged: vi.fn(async () => {}), syncApprovedDeviceReminders: vi.fn(async () => ""),
  };
  callbacks.setPending.mockImplementation((value: boolean) => { context.pending = value; });
  const code = [declaration("setInput"), declaration("sendMessage"), declaration("act"), `${cleanupEffect};`, "({sendMessage,act,setInput});"].join("\n");
  const handlers = vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context) as {
    sendMessage: (text: string, consent?: boolean) => Promise<void>;
    act: (action: "confirm" | "cancel" | "edit") => Promise<void>;
    setInput: (text: string) => void;
  };
  for (const callback of Object.values(callbacks)) callback.mockClear();
  handlers.setInput("first message");
  return { ...handlers, context, fetch, callbacks, dispose: () => dispose(), store, changeOwner: (next: string) => {
    dispose(); context.owner = next; context.session.user.id = next; dispose = setup();
  } };
}
const reply = () => Response.json({ data: { reply: "synthetic", draft: null, conversationId: "conversation", candidates: [], mode: "local" } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("unavailable session storage", () => {
  it("catches failure to access the storage object itself", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, get() { throw new DOMException("synthetic blocked", "SecurityError"); } });
    try {
      expect(() => saveComposeDraft("guest", "text")).not.toThrow();
      expect(readComposeDraft("guest")).toBe("");
      expect(() => offerGuestDraft()).not.toThrow();
      expect(claimGuestDraft()).toBe("");
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
      else Reflect.deleteProperty(globalThis, "sessionStorage");
    }
  });
  it("continues without a browser storage global", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(() => saveComposeDraft("guest", "text")).not.toThrow();
    expect(readComposeDraft("guest")).toBe("");
    expect(() => offerGuestDraft()).not.toThrow();
    expect(claimGuestDraft()).toBe("");
  });
});

describe("assistant request lifetime", () => {
  it("unlocks the same mounted component for a new owner and isolates the outstanding response", async () => {
    const shared = storage(), f = fixture(shared), old = deferred<Response>(), next = deferred<Response>();
    saveComposeDraft("second-user", "second private draft", shared);
    saveComposeDraft("guest", "guest private draft", shared); offerGuestDraft(shared);
    f.fetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const first = f.sendMessage("first message");
    expect(f.context.pending).toBe(true); expect(f.context.sending.current).toBe(true);
    const oldSignal = f.fetch.mock.calls[0][1].signal!;
    f.changeOwner("second-user");
    expect(oldSignal.aborted).toBe(true);
    expect(f.context.pending).toBe(false); expect(f.context.sending.current).toBe(false);
    expect(f.context.inputValue.current).toBe("second private draft");
    expect(readComposeDraft("guest", shared)).toBe("guest private draft");
    expect(readComposeDraft("synthetic-user", shared)).toBe("first message");
    const second = f.sendMessage("second private draft");
    expect(f.fetch).toHaveBeenCalledTimes(2);
    old.resolve(reply()); await first;
    expect(f.context.pending).toBe(true); expect(f.context.sending.current).toBe(true);
    expect(readComposeDraft("second-user", shared)).toBe("second private draft");
    next.resolve(reply()); await second;
    expect(f.context.pending).toBe(false); expect(readComposeDraft("second-user", shared)).toBe("");
    expect(readComposeDraft("synthetic-user", shared)).toBe("first message");
    f.changeOwner("guest"); expect(f.context.inputValue.current).toBe("guest private draft"); f.dispose();
  });
  it("aborts on leaving and ignores a late body without clearing a remounted draft", async () => {
    const shared = storage(), old = fixture(shared), body = deferred<unknown>();
    old.fetch.mockResolvedValue({ ok: true, json: () => body.promise } as Response);
    const pending = old.sendMessage("first message", true);
    await Promise.resolve();
    const signal = old.fetch.mock.calls[0][1].signal!;
    old.dispose(); expect(signal.aborted).toBe(true);
    const next = fixture(shared); next.setInput("new unsent message");
    body.resolve(await reply().json()); await pending;
    expect(readComposeDraft("synthetic-user", shared)).toBe("new unsent message");
    expect(old.callbacks.setReply).not.toHaveBeenCalled();
    expect(old.callbacks.setInputValue).toHaveBeenCalledTimes(1);
    expect(old.callbacks.setPending).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(old.fetch.mock.calls[0][1].body)).externalConsent).toBe(true);
    next.dispose();
  });
  it("ignores a late network failure after leaving", async () => {
    const f = fixture(), response = deferred<Response>(); f.fetch.mockReturnValue(response.promise);
    const pending = f.sendMessage("first message"); f.dispose();
    response.reject(new Error("synthetic failure")); await pending;
    expect(f.callbacks.setStatus.mock.calls).toEqual([[""]]);
    expect(readComposeDraft("synthetic-user", f.store)).toBe("first message");
  });
  it("does not clear text replaced while the current response is pending", async () => {
    const f = fixture(), response = deferred<Response>(); f.fetch.mockReturnValue(response.promise);
    const pending = f.sendMessage("first message"); f.setInput("different suggestion");
    response.resolve(reply()); await pending;
    expect(readComposeDraft("synthetic-user", f.store)).toBe("different suggestion");
    expect(f.callbacks.setReply).toHaveBeenCalledWith("synthetic");
    f.dispose();
  });
  it("clears only a successful current message and blocks duplicate sends", async () => {
    const f = fixture(), response = deferred<Response>(); f.fetch.mockReturnValue(response.promise);
    const pending = f.sendMessage("first message"); await f.sendMessage("first message");
    expect(f.fetch).toHaveBeenCalledTimes(1);
    response.resolve(reply()); await pending;
    expect(readComposeDraft("synthetic-user", f.store)).toBe("");
    expect(f.callbacks.setPending).toHaveBeenLastCalledWith(false); f.dispose();
  });
  it("ignores a late confirmation after leaving without claiming it was cancelled", async () => {
    const f = fixture(), response = deferred<Response>(); f.fetch.mockReturnValue(response.promise);
    const pending = f.act("confirm"); f.dispose();
    response.resolve(Response.json({ data: { message: "saved", remindersScheduled: 0 } })); await pending;
    expect(f.callbacks.setDraft).not.toHaveBeenCalled();
    expect(f.context.syncApprovedDeviceReminders).not.toHaveBeenCalled();
    expect(f.context.onChanged).not.toHaveBeenCalled();
    expect(f.callbacks.setStatus.mock.calls).toEqual([[""]]);
  });
  it("retains the same draft/revision on an unknown confirmation response and retry", async () => {
    const f = fixture(); f.fetch.mockRejectedValueOnce(new Error("lost reply"));
    await f.act("confirm");
    expect(f.callbacks.setDraft).not.toHaveBeenCalled();
    f.fetch.mockResolvedValueOnce(Response.json({ data: { message: "saved", remindersScheduled: 0 } }));
    await f.act("confirm");
    expect(f.fetch.mock.calls[1][0]).toBe(f.fetch.mock.calls[0][0]);
    expect(f.fetch.mock.calls[1][1].body).toBe(f.fetch.mock.calls[0][1].body);
    expect(JSON.parse(String(f.fetch.mock.calls[1][1].body))).toEqual({ action: "confirm", revision: 7, confirmed: true });
    expect(f.context.onChanged).toHaveBeenCalledTimes(1); f.dispose();
  });
  it("rejects an aborted late success and retains the message for retry", async () => {
    vi.useFakeTimers();
    const f = fixture(), response = deferred<Response>(); f.fetch.mockReturnValue(response.promise);
    const pending = f.sendMessage("first message");
    vi.advanceTimersByTime(35000); expect(f.fetch.mock.calls[0][1].signal!.aborted).toBe(true);
    response.resolve(reply()); await pending;
    expect(f.callbacks.setReply).not.toHaveBeenCalled();
    expect(readComposeDraft("synthetic-user", f.store)).toBe("first message");
    expect(f.callbacks.setPending).toHaveBeenLastCalledWith(false);
    expect(vi.getTimerCount()).toBe(0); f.dispose();
  });
});
