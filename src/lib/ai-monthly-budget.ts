import "server-only";
import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient, type Transaction } from "@libsql/client";

export const MONTHLY_CAP_MICRO_USD = 2_000_000;
export const MONTHLY_RESERVATION_MICRO_USD = 25_000;
const names = ["OPENAI_MONTHLY_BUDGET_USD", "OPENAI_BUDGET_DATABASE_FILE", "OPENAI_ALLOWED_USER_IDS"] as const;
function outside(file: string) {
  const relative = path.relative(process.cwd(), file);
  return path.isAbsolute(file) && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}
export function monthlyPolicy(userId?: string) {
  const configured = process.env.OPENAI_PERSONAL_USE === "true" || names.some(name => process.env[name] !== undefined);
  const file = process.env.OPENAI_BUDGET_DATABASE_FILE?.trim() || "";
  const owners = (process.env.OPENAI_ALLOWED_USER_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  const valid = process.env.OPENAI_MONTHLY_BUDGET_USD === "2" && outside(file) && file.endsWith(".db") && owners.length > 0 && owners.length <= 5 && owners.every(x => /^[\w-]{1,150}$/.test(x)) && (process.env.OPENAI_MODEL || "gpt-5-mini") === "gpt-5-mini";
  return { configured, valid, allowed: !configured || (valid && Boolean(userId && owners.includes(userId))), file };
}
function fail(): never { const error = new Error("Monthly GPT budget unavailable"); error.name = "TiaMonthlyBudgetError"; throw error; }
function month(now: Date) { if (!Number.isFinite(now.getTime())) fail(); return now.toISOString().slice(0, 7); }
async function connection(file: string) {
  const resolved = await realpath(file).catch(fail);
  if (!outside(resolved) || !(await stat(resolved)).isFile()) fail();
  // Request paths must NEVER recreate a missing spend ledger.
  return createClient({ url: `file:${resolved.replaceAll("\\", "/")}` });
}
async function meta(tx: Transaction, period: string) {
  const row = (await tx.execute("SELECT * FROM BudgetMeta WHERE id=1")).rows[0];
  if (!row || row.version !== 1 || row.cap !== MONTHLY_CAP_MICRO_USD || row.halted !== 0 || String(row.latestMonth) > period) fail();
}
async function charged(tx: Transaction, period: string) {
  const result = (await tx.execute({ sql: "SELECT COALESCE(SUM(charged),0) AS used FROM BudgetReceipt WHERE month=? OR settled=0", args: [period] })).rows[0];
  const value = Number(result.used); if (!Number.isSafeInteger(value) || value < 0) fail(); return value;
}
function validateWire(url: string, body: string) {
  const bytes = Buffer.byteLength(body, "utf8"), wire = JSON.parse(body);
  const textOnly = typeof wire.input === "string" || (Array.isArray(wire.input) && wire.input.every((message: { role?: string; content?: unknown }) =>
    ["system", "developer", "user", "assistant"].includes(message?.role || "") && (typeof message.content === "string" || (Array.isArray(message.content) && message.content.every((part: { type?: string; text?: unknown }) =>
      ["input_text", "output_text"].includes(part?.type || "") && typeof part.text === "string")))));
  if (url !== "https://api.openai.com/v1/responses" || bytes > 64_000 || wire.model !== "gpt-5-mini" || wire.service_tier !== "default" || wire.store !== false ||
    wire.stream || wire.background || wire.previous_response_id || wire.conversation || (wire.tools?.length ?? 0) !== 0 || !textOnly ||
    !Number.isSafeInteger(wire.max_output_tokens) || wire.max_output_tokens < 1 || wire.max_output_tokens > 2200) fail();
  const maximumInput = bytes + 4096;
  if (Math.ceil(maximumInput * 0.25 + wire.max_output_tokens * 2) > MONTHLY_RESERVATION_MICRO_USD) fail();
  return { maximumInput, maximumOutput: wire.max_output_tokens as number };
}
export type MonthlyReservation = { file: string; id: string; period: string; maximumInput: number; maximumOutput: number };

export async function reserveMonthlyRequest(userId: string | undefined, url: string, body: string, now = new Date()): Promise<MonthlyReservation | null> {
  const policy = monthlyPolicy(userId);
  if (!policy.configured) return null; // Existing synthetic/legacy deployments remain independently gated.
  if (!policy.allowed) fail();
  let client, tx;
  try {
    const bounds = validateWire(url, body), period = month(now);
    client = await connection(policy.file); tx = await client.transaction("write");
    await meta(tx, period);
    if (await charged(tx, period) + MONTHLY_RESERVATION_MICRO_USD > MONTHLY_CAP_MICRO_USD) fail();
    const id = randomUUID();
    await tx.execute({ sql: "INSERT INTO BudgetReceipt(id,month,charged,settled,createdAt) VALUES(?,?,?,0,?)", args: [id, period, MONTHLY_RESERVATION_MICRO_USD, now.toISOString()] });
    await tx.execute({ sql: "UPDATE BudgetMeta SET latestMonth=? WHERE id=1", args: [period] });
    await tx.commit(); return { file: policy.file, id, period, ...bounds };
  } catch { return fail(); } finally { tx?.close(); client?.close(); }
}
async function boundedBody(response: Response) {
  const reader = response.clone().body?.getReader(); if (!reader) throw new Error("No usage");
  let length = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 262_144) throw new Error("Oversized usage"); chunks.push(value); } }
  finally { void reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function settleMonthlyRequest(reservation: MonthlyReservation | null, response?: Response, now = new Date()) {
  if (!reservation || !response?.ok) return; // Unknown/failed calls keep their full charge, including across months.
  let client, tx;
  try {
    const usage = (await boundedBody(response)).usage;
    const input = usage?.input_tokens, output = usage?.output_tokens, cached = usage?.input_tokens_details?.cached_tokens ?? 0;
    if (![input, output, cached].every(x => Number.isSafeInteger(x) && x >= 0) || cached > input) return;
    const estimate = Math.ceil((input - cached) * 0.25 + cached * 0.025 + output * 2);
    const exceeded = input > reservation.maximumInput || output > reservation.maximumOutput || estimate > MONTHLY_RESERVATION_MICRO_USD;
    const period = month(now);
    client = await connection(reservation.file); tx = await client.transaction("write");
    const receipt = (await tx.execute({ sql: "SELECT settled,month FROM BudgetReceipt WHERE id=?", args: [reservation.id] })).rows[0];
    if (!receipt || receipt.settled === 1 || period < String(receipt.month)) return;
    if (exceeded) await tx.execute("UPDATE BudgetMeta SET halted=1 WHERE id=1");
    if (period === receipt.month) {
      await tx.execute({ sql: "UPDATE BudgetReceipt SET charged=?,inputTokens=?,outputTokens=?,cachedTokens=?,settled=1 WHERE id=? AND settled=0", args: [estimate, input, output, cached, reservation.id] });
    } else {
      // Keep the start-month reservation; replace its pending carry with measured
      // usage in the end month. Never refund a call across a month boundary.
      await tx.execute({ sql: "UPDATE BudgetReceipt SET settled=1 WHERE id=?", args: [reservation.id] });
      await tx.execute({ sql: "INSERT INTO BudgetReceipt(id,month,charged,settled,createdAt,inputTokens,outputTokens,cachedTokens) VALUES(?,?,?,1,?,?,?,?)", args: [reservation.id + ":settled", period, estimate, now.toISOString(), input, output, cached] });
    }
    await tx.commit();
  } catch { /* Keep full reservation; never retry/refund unknown spend or log provider data. */ }
  finally { tx?.close(); client?.close(); }
}
export async function monthlyBudgetStatus(userId?: string, now = new Date()) {
  const policy = monthlyPolicy(userId);
  if (!policy.configured) return null;
  if (!policy.allowed) return { available: false, limitUsd: 2 };
  let client, tx;
  try {
    const period = month(now); client = await connection(policy.file); tx = await client.transaction("read");
    await meta(tx, period); const used = await charged(tx, period);
    return { available: used + MONTHLY_RESERVATION_MICRO_USD <= MONTHLY_CAP_MICRO_USD, limitUsd: 2, accountedUsd: used / 1_000_000, period, basis: "usage-plus-pending-reservations" };
  } catch { return { available: false, limitUsd: 2 }; }
  finally { tx?.close(); client?.close(); }
}
