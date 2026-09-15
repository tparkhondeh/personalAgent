import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const state = vi.hoisted(() => ({ platform: "win32", mtime: 1, size: 390, fail: false, resolved: "", reply: "", exitCode: 0, input: "" }));
vi.mock("server-only", () => ({}));
vi.mock("node:os", () => ({ platform: () => state.platform }));
vi.mock("node:fs/promises", () => ({
  stat: vi.fn(async () => { if (state.fail) throw new Error("private-file-details"); return { isFile: () => true, mtimeMs: state.mtime, size: state.size }; }),
  realpath: vi.fn(async (file: string) => state.resolved || file),
  readFile: vi.fn(async () => Buffer.from("synthetic-encrypted-bytes")),
}));
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() });
  child.stdin.on("data", (chunk: Buffer) => { state.input += chunk.toString(); });
  queueMicrotask(() => { child.stdout.write(state.reply); child.emit("close", state.exitCode); });
  return child;
}) }));
import { spawn } from "node:child_process";
import { hasOpenAICredential, loadOpenAICredential } from "./openai-credential";
import { providerFailure } from "./agent-provider-status";
beforeEach(() => {
  vi.clearAllMocks(); state.mtime++; state.platform = "win32"; state.size = 390; state.fail = false; state.resolved = ""; state.exitCode = 0; state.input = "";
  state.reply = ["sk", "synthetic".repeat(4)].join("-");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY_DPAPI_FILE", path.resolve("../synthetic-private/key.dpapi"));
  vi.stubEnv("OPENAI_DPAPI_POWERSHELL", path.resolve("../synthetic-tools/pwsh.exe"));
});
afterEach(() => { vi.unstubAllEnvs(); });
describe("server-only protected credential, no real keys or API calls", () => {
  it("preserves the existing environment-key path without touching disk/decryption", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-env-credential");
    expect(hasOpenAICredential()).toBe(true);
    expect(await loadOpenAICredential()).toBe("synthetic-env-credential");
    expect(spawn).not.toHaveBeenCalled();
  });
  it("coalesces concurrent decryption, pipes ciphertext only and rechecks changed files", async () => {
    expect(hasOpenAICredential()).toBe(true);
    expect(await Promise.all([loadOpenAICredential(), loadOpenAICredential()])).toEqual([state.reply, state.reply]);
    expect(spawn).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(spawn).mock.calls)).not.toContain(state.reply);
    expect(state.input).toBe(Buffer.from("synthetic-encrypted-bytes").toString("base64"));
    state.mtime++; await loadOpenAICredential(); expect(spawn).toHaveBeenCalledTimes(2);
  });
  it("does not enable a Windows-only secret file on Linux", async () => {
    state.platform = "linux"; expect(hasOpenAICredential()).toBe(false);
    await expect(loadOpenAICredential()).rejects.toMatchObject({ name: "TiaCredentialError" });
    expect(spawn).not.toHaveBeenCalled();
  });
  it.each(["relative.dpapi", path.resolve("public/key.dpapi")])("rejects unsafe configured paths %s", async file => {
    vi.stubEnv("OPENAI_API_KEY_DPAPI_FILE", file); expect(hasOpenAICredential()).toBe(false);
    await expect(loadOpenAICredential()).rejects.toMatchObject({ name: "TiaCredentialError" });
    expect(spawn).not.toHaveBeenCalled();
  });
  it("rejects a link resolving inside the served workspace", async () => {
    state.resolved = path.resolve("public/key.dpapi");
    await expect(loadOpenAICredential()).rejects.toMatchObject({ name: "TiaCredentialError" }); expect(spawn).not.toHaveBeenCalled();
  });
  it.each([0, 10000])("rejects invalid encrypted-file size %s", async size => {
    state.size = size; await expect(loadOpenAICredential()).rejects.toMatchObject({ name: "TiaCredentialError" }); expect(spawn).not.toHaveBeenCalled();
  });
  it("sanitizes missing files and decryption failures; never includes private output", async () => {
    state.fail = true;
    await expect(loadOpenAICredential()).rejects.toThrow("GPT credential unavailable");
    state.fail = false; state.exitCode = 1; state.reply = "private-invalid-output";
    const error = await loadOpenAICredential().catch(error => error);
    expect(providerFailure(error)).toBe("credentials"); expect(String(error)).not.toContain("private");
    state.exitCode = 0; state.reply = ["sk", "synthetic".repeat(4)].join("-");
    expect(await loadOpenAICredential()).toBe(state.reply);
  });
});
