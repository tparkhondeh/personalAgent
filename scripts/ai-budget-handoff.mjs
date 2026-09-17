// Operator-only handoff. No credentials, network calls, service restart or automatic activation.
import { createHash, randomUUID } from "node:crypto";
import { chmod, copyFile, realpath, stat, statfs } from "node:fs/promises";
import { constants } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

const cap = 2_000_000;
const normalize = file => file.replaceAll("\\", "/");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail() { throw Error("Budget handoff refused; retain the frozen source and review private evidence."); }
function outside(file) {
  const relative = path.relative(process.cwd(), file);
  return path.isAbsolute(file) && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}
async function existing(file) {
  if (!file || !outside(file) || !file.endsWith(".db")) fail();
  const resolved = await realpath(file);
  if (!outside(resolved) || !(await stat(resolved)).isFile()) fail();
  return resolved;
}
async function fresh(file) {
  if (!file || !outside(file) || !file.endsWith(".db")) fail();
  const parent = await realpath(path.dirname(file));
  if (process.platform !== "win32" && ((await stat(parent)).mode & 0o077) !== 0) fail();
  const resolved = path.join(parent, path.basename(file));
  if (!outside(resolved)) fail();
  const fs = await statfs(parent, { bigint: true });
  if (fs.bavail * fs.bsize < 536870912n) fail();
  try { await stat(resolved); fail(); } catch (error) { if (error.code !== "ENOENT") throw error; }
  return resolved;
}
async function state(tx) {
  const integrity = (await tx.execute("PRAGMA integrity_check")).rows;
  const metadata = (await tx.execute("SELECT * FROM BudgetMeta")).rows;
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok" || metadata.length !== 1) fail();
  const meta = metadata[0];
  if (meta.id !== 1 || ![1, 2].includes(meta.version) || meta.cap !== cap || ![0, 1].includes(meta.halted) || !/^\d{4}-\d{2}$/.test(String(meta.latestMonth))) fail();
  const receipts = (await tx.execute("SELECT * FROM BudgetReceipt ORDER BY id")).rows;
  let total = 0;
  for (const row of receipts) {
    if (!Number.isSafeInteger(row.charged) || row.charged < 0 || ![0, 1].includes(row.settled)) fail();
    total += row.charged;
    if (!Number.isSafeInteger(total)) fail();
  }
  const authority = meta.version === 2 ? (await tx.execute("SELECT * FROM BudgetAuthority WHERE id=1")).rows[0] : null;
  return { meta: { ...meta }, receipts: receipts.map(row => ({ ...row })), authority: authority ? { ...authority } : null };
}
function bound(authority, file) {
  return authority && authority.targetHost === hostname() && authority.targetPath === normalize(file);
}
function frozen(value) {
  return value.meta.version === 2 && value.meta.halted === 1 && value.authority?.phase === "FROZEN";
}
function summary(value) {
  return { digest: digest(value), version: value.meta.version, halted: value.meta.halted === 1,
    receiptCount: value.receipts.length, chargedMicroUsd: value.receipts.reduce((n, r) => n + r.charged, 0),
    pendingCount: value.receipts.filter(r => r.settled === 0).length, period: value.meta.latestMonth,
    phase: value.authority?.phase ?? "LEGACY" };
}
export async function inspectBudget(file) {
  const resolved = await existing(file), db = createClient({ url: pathToFileURL(resolved).href });
  let tx;
  try { tx = await db.transaction("read"); return summary(await state(tx)); }
  finally { tx?.close(); db.close(); }
}
export async function exportFrozenBudget(file, snapshot) {
  const resolved = await existing(file), output = await fresh(snapshot);
  const db = createClient({ url: pathToFileURL(resolved).href }); let tx;
  try {
    tx = await db.transaction("read"); const value = await state(tx);
    if (!frozen(value)) fail();
    tx.close(); tx = undefined;
    await db.execute(`VACUUM INTO '${output.replaceAll("'", "''")}'`);
    await chmod(output, 0o600);
    const verified = await inspectBudget(output);
    if (verified.digest !== digest(value)) fail();
    return { ...verified, sourceFrozen: true, activated: false };
  } finally { tx?.close(); db.close(); }
}
export async function freezeBudget(file, snapshot, expectedDigest, targetHost, targetPath) {
  const resolved = await existing(file), output = await fresh(snapshot);
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || "") || !/^[\w.-]{1,253}$/.test(targetHost || "") ||
    typeof targetPath !== "string" || !targetPath.endsWith(".db") || /[\r\n\0]/.test(targetPath) ||
    !(/^[A-Za-z]:\//.test(targetPath) || targetPath.startsWith("/")) || targetPath.split("/").some(p => p === ".." || p === ".") ||
    (targetHost === hostname() && targetPath === normalize(resolved))) fail();
  const db = createClient({ url: pathToFileURL(resolved).href }); let tx;
  try {
    tx = await db.transaction("write"); const before = await state(tx);
    if (digest(before) !== expectedDigest || before.meta.halted !== 0 ||
      (before.meta.version === 2 && (!bound(before.authority, resolved) || before.authority.phase !== "ACTIVE"))) fail();
    await tx.execute("CREATE TABLE IF NOT EXISTS BudgetAuthority(id INTEGER PRIMARY KEY CHECK(id=1),transferId TEXT NOT NULL,targetHost TEXT NOT NULL,targetPath TEXT NOT NULL,phase TEXT NOT NULL,sourceDigest TEXT NOT NULL)");
    await tx.execute({ sql: "INSERT INTO BudgetAuthority VALUES(1,?,?,?,'FROZEN',?) ON CONFLICT(id) DO UPDATE SET transferId=excluded.transferId,targetHost=excluded.targetHost,targetPath=excluded.targetPath,phase=excluded.phase,sourceDigest=excluded.sourceDigest",
      args: [randomUUID(), targetHost, targetPath, expectedDigest] });
    await tx.execute("UPDATE BudgetMeta SET version=2,halted=1 WHERE id=1");
    const after = await state(tx);
    if (digest(before.receipts) !== digest(after.receipts)) fail();
    await tx.commit(); tx.close(); tx = undefined;
    // Any export failure intentionally leaves the source frozen. Never reset it on rollback.
    const verified = await exportFrozenBudget(resolved, output);
    if (verified.digest !== digest(after)) fail();
    return { ...verified, sourceFrozen: true, activated: false };
  } finally { tx?.close(); db.close(); }
}
export async function activateBudget(snapshot, destination, expectedDigest) {
  const input = await existing(snapshot), output = await fresh(destination);
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || "")) fail();
  const source = createClient({ url: pathToFileURL(input).href }); let read;
  try {
    read = await source.transaction("read"); const value = await state(read);
    if (!frozen(value) || !bound(value.authority, output) || digest(value) !== expectedDigest) fail();
  } finally { read?.close(); source.close(); }
  // Exclusive copy: retry cannot overwrite a live/partly activated ledger or refund spend.
  await copyFile(input, output, constants.COPYFILE_EXCL);
  await chmod(output, 0o600);
  const db = createClient({ url: pathToFileURL(output).href }); let tx;
  try {
    tx = await db.transaction("write"); const value = await state(tx);
    if (!frozen(value) || !bound(value.authority, output) || digest(value) !== expectedDigest) fail();
    await tx.execute("UPDATE BudgetAuthority SET phase='ACTIVE' WHERE id=1");
    await tx.execute("UPDATE BudgetMeta SET halted=0 WHERE id=1");
    await tx.commit();
    return { activated: true, receiptCount: value.receipts.length, chargedMicroUsd: summary(value).chargedMicroUsd };
  } finally { tx?.close(); db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "inspect") console.log(JSON.stringify(await inspectBudget(...args)));
    else if (mode === "freeze") console.log(JSON.stringify(await freezeBudget(...args)));
    else if (mode === "export-frozen") console.log(JSON.stringify(await exportFrozenBudget(...args)));
    else if (mode === "activate") console.log(JSON.stringify(await activateBudget(...args)));
    else throw Error("Use inspect file | freeze source snapshot expectedDigest targetHost targetPath | export-frozen source freshSnapshot | activate snapshot destination expectedDigest. Quiesce paid instances first; never restore an older spend ledger.");
  } catch { console.error("Budget handoff refused. No automatic refund, reactivation or cleanup performed."); process.exitCode = 1; }
}
