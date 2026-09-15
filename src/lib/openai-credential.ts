import "server-only";
import path from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { platform } from "node:os";

function credentialError(): never {
  const error = new Error("GPT credential unavailable");
  error.name = "TiaCredentialError";
  throw error;
}
function outsideWorkspace(file: string) {
  const relative = path.relative(process.cwd(), file);
  return path.isAbsolute(file) && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}
function protectedConfig() {
  const file = process.env.OPENAI_API_KEY_DPAPI_FILE?.trim();
  const executable = process.env.OPENAI_DPAPI_POWERSHELL?.trim() || path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return { file, executable, valid: platform() === "win32" && Boolean(file && outsideWorkspace(file) && file.endsWith(".dpapi")) && path.isAbsolute(executable) };
}

// Configuration only; do not claim a file/key is valid until a real response succeeds.
export function hasOpenAICredential() {
  return Boolean(process.env.OPENAI_API_KEY?.trim()) || protectedConfig().valid;
}

const decryptCommand = String.raw`
$ErrorActionPreference='Stop'
try {
  Add-Type -AssemblyName System.Security
  $encrypted=[Convert]::FromBase64String([Console]::In.ReadToEnd())
  $entropy=[Text.Encoding]::UTF8.GetBytes('tia-pending-openai-key-v1')
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))
} catch { exit 1 } finally { if($plain){[Array]::Clear($plain,0,$plain.Length)} }
`;

async function decrypt(file: string, executable: string) {
  const resolved = await realpath(file).catch(credentialError);
  if (!outsideWorkspace(resolved)) credentialError();
  const metadata = await stat(resolved).catch(credentialError);
  if (!metadata.isFile() || metadata.size < 100 || metadata.size > 8192) credentialError();
  const encrypted = await readFile(resolved).catch(credentialError);
  return new Promise<string>((resolve, reject) => {
    // Never pass plaintext in argv/environment, and never inherit child output.
    const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-Command", decryptCommand], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let value = "", failed = false;
    const timer = setTimeout(() => { failed = true; child.kill(); }, 5000);
    child.stdout.on("data", chunk => { value += chunk.toString(); if (value.length > 4096) { failed = true; value = ""; child.kill(); } });
    child.stderr.resume();
    child.stdin.on("error", () => { failed = true; });
    child.on("error", () => { failed = true; });
    child.on("close", code => {
      clearTimeout(timer); encrypted.fill(0);
      const key = value.trim(); value = "";
      if (!failed && code === 0 && /^sk-[A-Za-z0-9_-]{20,2000}$/.test(key)) resolve(key);
      else { try { credentialError(); } catch (error) { reject(error); } }
    });
    child.stdin.end(encrypted.toString("base64"));
  });
}

// One decryption in flight; process-memory only, no plaintext persisted.
let cached: { identity: string; result: Promise<string> } | undefined;
export async function loadOpenAICredential() {
  const ordinary = process.env.OPENAI_API_KEY?.trim();
  if (ordinary) return ordinary;
  const config = protectedConfig();
  if (!config.valid || !config.file) credentialError();
  const metadata = await stat(config.file).catch(credentialError);
  const identity = `${config.file}:${config.executable}:${metadata.mtimeMs}:${metadata.size}`;
  if (cached?.identity !== identity) {
    const result = decrypt(config.file, config.executable);
    cached = { identity, result };
    result.catch(() => { if (cached?.identity === identity) cached = undefined; });
  }
  return cached!.result;
}
