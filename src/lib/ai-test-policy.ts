import "server-only";
import path from "node:path";
import { open, stat } from "node:fs/promises";

// Optional, one-off synthetic QA policy. It NEVER grants normal-use consent.
// Pricing checked 2026-09-15: GPT-5 mini, default tier, $0.25/M input, $2/M output.
export const TEST_RESERVATION_MICRO_USD = 25_000;
export const TEST_TOTAL_MICRO_USD = 250_000;
const names = ["OPENAI_TEST_USER_ID", "OPENAI_TEST_LEDGER_DIR", "OPENAI_TEST_EXPIRES_AT"] as const;

export function syntheticTestPolicy(userId?: string) {
  const configured = names.some(name => process.env[name] !== undefined);
  const owner = process.env.OPENAI_TEST_USER_ID?.trim();
  const dir = process.env.OPENAI_TEST_LEDGER_DIR?.trim() || "";
  const expires = Date.parse(process.env.OPENAI_TEST_EXPIRES_AT || "");
  const relative = dir ? path.relative(process.cwd(), dir) : "";
  // Refuse a ledger under the web workspace, especially public/static assets.
  const privatePath = path.isAbsolute(dir) && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
  const valid = Boolean(owner && owner.length <= 150 && privatePath && Number.isFinite(expires) && expires > Date.now());
  return { configured, valid, allowed: !configured || (valid && userId === owner), dir };
}

function blocked(): never {
  const error = new Error("Synthetic test allowance unavailable");
  error.name = "TiaTestBudgetError";
  throw error;
}

function textOnly(input: unknown): boolean {
  return typeof input === "string" || (Array.isArray(input) && input.every(message => {
    if (!message || typeof message !== "object" || !["system", "developer", "user", "assistant"].includes(message.role)) return false;
    return typeof message.content === "string" || (Array.isArray(message.content) && message.content.every((part: { type?: string; text?: unknown }) =>
      part && ["input_text", "output_text"].includes(part.type || "") && typeof part.text === "string"));
  }));
}

async function exists(file: string) {
  try { await stat(file); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    blocked();
  }
}

async function exclusiveJson(file: string, data: unknown) {
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); } finally { await handle.close(); }
}

// The whole request is bounded before a durable reservation, then before egress.
// Reservations are NOT refunded, even on timeout/error/restart: uncertain calls
// cannot be used to replenish the approved allowance. Keep this directory.
export async function reserveSyntheticTest(url: string, body: string) {
  const policy = syntheticTestPolicy();
  if (!policy.configured) return null;
  if (!policy.valid || url !== "https://api.openai.com/v1/responses") blocked();
  const bytes = new TextEncoder().encode(body).byteLength;
  let wire;
  try { wire = JSON.parse(body); } catch { blocked(); }
  if (!wire || typeof wire !== "object" || bytes > 64_000 || wire.model !== "gpt-5-mini" || wire.service_tier !== "default" || wire.store !== false ||
      wire.stream || wire.background || wire.previous_response_id || wire.conversation ||
      (wire.tools?.length ?? 0) !== 0 || !textOnly(wire.input) ||
      !Number.isSafeInteger(wire.max_output_tokens) || wire.max_output_tokens < 1 || wire.max_output_tokens > 2200) blocked();
  // Conservative UTF-8 byte/token bound plus framing allowance, no cache discount.
  const maximumEstimate = Math.ceil((bytes + 4096) * 0.25 + wire.max_output_tokens * 2);
  if (maximumEstimate > TEST_RESERVATION_MICRO_USD) blocked();
  if (await exists(path.join(policy.dir, "HALT.json"))) blocked();
  for (let slot = 1; slot <= TEST_TOTAL_MICRO_USD / TEST_RESERVATION_MICRO_USD; slot++) {
    const receipt = path.join(policy.dir, `reservation-${slot}.json`);
    try {
      await exclusiveJson(receipt, { reservedMicroUsd: TEST_RESERVATION_MICRO_USD, maximumEstimateMicroUsd: maximumEstimate, at: new Date().toISOString() });
      return { dir: policy.dir, slot, maximumInputTokens: bytes + 4096, maximumOutputTokens: wire.max_output_tokens as number };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") blocked();
    }
  }
  blocked();
}

export async function recordSyntheticUsage(reservation: Awaited<ReturnType<typeof reserveSyntheticTest>>, response?: Response) {
  if (!reservation) return;
  const { dir, slot } = reservation;
  let result: Record<string, unknown> = { status: response?.status ?? null, usageVerified: false, reservedMicroUsd: TEST_RESERVATION_MICRO_USD };
  try {
    if (response?.ok) {
      const body = await response.clone().text();
      if (body.length > 262_144) throw new Error("Oversized result");
      const usage = JSON.parse(body).usage;
      const input = usage?.input_tokens, output = usage?.output_tokens, cached = usage?.input_tokens_details?.cached_tokens ?? 0;
      if (![input, output, cached].every(n => Number.isSafeInteger(n) && n >= 0) || cached > input) throw new Error("Unknown usage");
      const estimatedMicroUsd = Math.ceil((input - cached) * 0.25 + cached * 0.025 + output * 2);
      result = { ...result, usageVerified: true, inputTokens: input, outputTokens: output, cachedInputTokens: cached, estimatedMicroUsd };
      if (input > reservation.maximumInputTokens || output > reservation.maximumOutputTokens || estimatedMicroUsd > TEST_RESERVATION_MICRO_USD) {
        await exclusiveJson(path.join(dir, "HALT.json"), { reason: "Usage exceeded reservation assumptions" });
      }
    }
  } catch { /* Preserve the full reservation for missing/uncertain usage. */ }
  // Safe numeric evidence only: NEVER serialize provider bodies, headers or errors.
  try { await exclusiveJson(path.join(dir, `usage-${slot}.json`), result); } catch { /* Reservation already remains consumed. */ }
}
