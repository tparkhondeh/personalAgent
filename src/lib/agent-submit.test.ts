import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute actual checked-in handlers, not a reimplementation, with inert boundaries.
const source = ts.createSourceFile("assistant.tsx", readFileSync("src/components/agent-assistant.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let sendSource = "", voiceSource = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "sendMessage") sendSource = node.getText(source);
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "VoiceInput") {
    const attr = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === "onText");
    if (attr && ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)) voiceSource = attr.initializer.expression!.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!sendSource || !voiceSource) throw new Error("Actual assistant handlers missing");
const script = ts.transpileModule(`${sendSource}\n({ sendMessage, onVoice: ${voiceSource} });`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture(external = false, signedIn = true) {
  const state: Record<string, unknown> = { pending: false, needsAccount: false, mode: "local", fallbackReason: undefined };
  const data = { reply: "پیشنهاد آزمایشی", mode: external ? "online" : "local", draft: { id: "same-draft", revision: 3 }, conversationId: "same-conversation", candidates: [] };
  const network = vi.fn(async () => Response.json({ data }));
  const context: Record<string, unknown> = {
    session: signedIn ? { user: { id: "synthetic" } } : null, pending: false, sending: { current: false }, external,
    conversationId: "same-conversation", draft: { id: "same-draft", revision: 2 }, fetch: network, AbortSignal,
  };
  for (const field of ["NeedsAccount", "Pending", "Status", "Attempted", "Reply", "Draft", "ConversationId", "Candidates", "Mode", "FallbackReason", "Input", "Edit"]) {
    context[`set${field}`] = (value: unknown) => { state[field[0].toLowerCase() + field.slice(1)] = value; };
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
  });
  it("does not submit signed-out or blank input", async () => {
    const f = fixture(true, false); await f.sendMessage("پیام ساختگی", true); await f.sendMessage(" ", true);
    expect(f.network).not.toHaveBeenCalled(); expect(f.state.needsAccount).toBe(true);
  });
  it("releases the submit lock on network failure and retains the user's input", async () => {
    const f = fixture(); f.state.input = "متن حفظ‌شده"; f.network.mockRejectedValueOnce(new Error("connection failed"));
    await f.sendMessage("متن حفظ‌شده");
    expect(f.state.input).toBe("متن حفظ‌شده"); expect(f.context.sending).toEqual({ current: false });
    await f.sendMessage("متن حفظ‌شده"); expect(f.network).toHaveBeenCalledTimes(2);
  });
});
