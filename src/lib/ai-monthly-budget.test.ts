import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";
vi.mock("server-only", () => ({}));
import { monthlyPolicy, reserveMonthlyRequest, settleMonthlyRequest, monthlyBudgetStatus } from "./ai-monthly-budget";
import { createBoundedOpenAiFetch } from "./agent";
import { providerFailure } from "./agent-provider-status";
const url = "https://api.openai.com/v1/responses";
const now = new Date("2026-09-15T10:00:00Z");
const payload = { model: "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: "PUBLIC SYNTHETIC" }] }], max_output_tokens: 2200, store: false, service_tier: "default" };
const body = JSON.stringify(payload);
const usage = (input = 100, output = 200) => Response.json({ usage: { input_tokens: input, output_tokens: output, input_tokens_details: { cached_tokens: 0 } } });
let file: string;
async function sql(statement: string, args: (string | number)[] = []) {
  const client = createClient({ url: pathToFileURL(file).href });
  try { return await client.execute({ sql: statement, args }); } finally { client.close(); }
}
async function seed(amount: number) { await sql("INSERT INTO BudgetReceipt VALUES('seed','2026-09',?,1,'synthetic',NULL,NULL,NULL)", [amount]); }
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Network disabled in monthly budget tests"); }));
  file = path.join(await mkdtemp(path.join(os.tmpdir(), "tia-monthly-qa-")), "budget.db");
  const client = createClient({ url: pathToFileURL(file).href });
  try { await client.executeMultiple(await readFile("scripts/ai-monthly-schema.sql", "utf8")); await client.execute("INSERT INTO BudgetMeta VALUES(1,1,2000000,'2026-09',0)"); } finally { client.close(); }
  vi.stubEnv("OPENAI_MONTHLY_BUDGET_USD", "2"); vi.stubEnv("OPENAI_BUDGET_DATABASE_FILE", file); vi.stubEnv("OPENAI_ALLOWED_USER_IDS", "owner,qa"); vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("durable shared monthly monetary guard (synthetic, no paid API)", () => {
  it("requires exact allowed users and complete private policy", async () => {
    expect(monthlyPolicy("owner").allowed).toBe(true); expect(monthlyPolicy("other").allowed).toBe(false);
    await expect(reserveMonthlyRequest(undefined, url, body, now)).rejects.toMatchObject({ name: "TiaMonthlyBudgetError" });
    vi.stubEnv("OPENAI_MONTHLY_BUDGET_USD", "200"); expect(monthlyPolicy("owner").allowed).toBe(false);
    vi.stubEnv("OPENAI_MONTHLY_BUDGET_USD", "2"); vi.stubEnv("OPENAI_BUDGET_DATABASE_FILE", path.resolve("public/budget.db"));
    expect(monthlyPolicy("owner").allowed).toBe(false);
  });
  it("does not recreate missing ledgers or disclose database details", async () => {
    vi.stubEnv("OPENAI_BUDGET_DATABASE_FILE", file + "-absent.db");
    const error = await reserveMonthlyRequest("owner", url, body, now).catch(x => x);
    expect(providerFailure(error)).toBe("monthly-budget"); expect(String(error)).not.toContain(file);
    expect(await monthlyBudgetStatus("owner", now)).toEqual({ available: false, limitUsd: 2 });
  });
  it("reserves before any network call and keeps unknown timeouts consumed", async () => {
    vi.setSystemTime(now);
    const external = vi.fn(async () => { expect((await sql("SELECT charged FROM BudgetReceipt")).rows[0].charged).toBe(25000); throw new Error("synthetic offline"); });
    vi.stubGlobal("fetch", external);
    await expect(createBoundedOpenAiFetch("owner")(url, { body })).rejects.toThrow("synthetic offline");
    expect(await monthlyBudgetStatus("owner", now)).toMatchObject({ accountedUsd: .025 });
    vi.useRealTimers();
  });
  it("settles verified usage once and never stores prompts or response text", async () => {
    const reservation = await reserveMonthlyRequest("owner", url, body, now);
    const response = usage(); await settleMonthlyRequest(reservation, response, now);
    expect((await response.json()).usage.input_tokens).toBe(100);
    await settleMonthlyRequest(reservation, usage(1, 1), now);
    expect(await monthlyBudgetStatus("owner", now)).toMatchObject({ accountedUsd: .000425 });
    expect(JSON.stringify((await sql("SELECT * FROM BudgetReceipt")).rows)).not.toContain("PUBLIC SYNTHETIC");
  });
  it.each([401, 429, 503])("never refunds an ambiguous HTTP %s", async status => {
    const reservation = await reserveMonthlyRequest("owner", url, body, now);
    await settleMonthlyRequest(reservation, Response.json({ error: "private" }, { status }), now);
    expect(await monthlyBudgetStatus("owner", now)).toMatchObject({ accountedUsd: .025 });
  });
  it("retains reservations with malformed or oversized usage", async () => {
    const r = await reserveMonthlyRequest("owner", url, body, now);
    await settleMonthlyRequest(r, Response.json({ usage: { input_tokens: -1 } }), now);
    await settleMonthlyRequest(r, new Response("x".repeat(262145)), now);
    expect(await monthlyBudgetStatus("owner", now)).toMatchObject({ accountedUsd: .025 });
  });
  it("shares the final allowance across concurrent users/connections", async () => {
    await seed(1975000);
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => reserveMonthlyRequest(i % 2 ? "owner" : "qa", url, body, now)));
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(await monthlyBudgetStatus("owner", now)).toMatchObject({ available: false, accountedUsd: 2 });
  });
  it("retains spend across separate process restarts and races", async () => {
    await seed(1975000);
    const moduleUrl = pathToFileURL(path.resolve("src/lib/ai-monthly-budget.ts")).href;
    const program = `import {reserveMonthlyRequest} from ${JSON.stringify(moduleUrl)}; try { await reserveMonthlyRequest('owner',${JSON.stringify(url)},${JSON.stringify(body)},new Date(${JSON.stringify(now.toISOString())})); console.log('reserved'); } catch { console.log('blocked'); }`;
    const run = () => promisify(execFile)(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", program], { env: { ...process.env }, windowsHide: true });
    const results = await Promise.all([run(), run()]);
    expect(results.map(x => x.stdout.trim()).sort()).toEqual(["blocked", "reserved"]);
    expect((await run()).stdout.trim()).toBe("blocked");
  }, 15000);
  it("rolls over completed usage while carrying uncertain requests", async () => {
    await seed(1950000);
    const pending = await reserveMonthlyRequest("owner", url, body, now);
    const next = new Date("2026-10-01T00:00:05Z");
    expect(await monthlyBudgetStatus("owner", next)).toMatchObject({ accountedUsd: .025 });
    await settleMonthlyRequest(pending, usage(), next);
    expect(await monthlyBudgetStatus("owner", next)).toMatchObject({ accountedUsd: .000425 });
    expect((await sql("SELECT SUM(charged) AS used FROM BudgetReceipt WHERE month='2026-09'")).rows[0].used).toBe(1975000);
    expect(await monthlyBudgetStatus("owner", now)).toEqual({ available: false, limitUsd: 2 });
    await reserveMonthlyRequest("owner", url, body, next);
    await expect(reserveMonthlyRequest("owner", url, body, now)).rejects.toThrow();
  });
  it("blocks clock rollback immediately after a new-month settlement", async () => {
    await seed(1950000);
    const pending = await reserveMonthlyRequest("owner", url, body, now);
    const next = new Date("2026-10-01T00:00:05Z");
    await settleMonthlyRequest(pending, usage(), next);
    await expect(reserveMonthlyRequest("owner", url, body, now)).rejects.toMatchObject({ name: "TiaMonthlyBudgetError" });
    expect((await sql("SELECT latestMonth FROM BudgetMeta")).rows[0].latestMonth).toBe("2026-10");
    expect(await monthlyBudgetStatus("owner", now)).toEqual({ available: false, limitUsd: 2 });
    expect(await monthlyBudgetStatus("owner", next)).toMatchObject({ accountedUsd: .000425 });
    expect((await sql("SELECT COUNT(*) AS n FROM BudgetReceipt")).rows[0].n).toBe(3);
  });
  it("retains settlement rollback protection in a fresh process", async () => {
    const pending = await reserveMonthlyRequest("owner", url, body, now);
    const next = new Date("2026-10-01T00:00:05Z");
    await settleMonthlyRequest(pending, usage(), next);
    const moduleUrl = pathToFileURL(path.resolve("src/lib/ai-monthly-budget.ts")).href;
    const program = `import {reserveMonthlyRequest} from ${JSON.stringify(moduleUrl)}; try { await reserveMonthlyRequest('owner',${JSON.stringify(url)},${JSON.stringify(body)},new Date(${JSON.stringify(now.toISOString())})); console.log('reserved'); } catch { console.log('blocked'); }`;
    const result = await promisify(execFile)(process.execPath, ["--conditions=react-server", "--input-type=module", "-e", program], { env: { ...process.env }, windowsHide: true });
    expect(result.stdout.trim()).toBe("blocked");
    expect((await sql("SELECT COUNT(*) AS n FROM BudgetReceipt")).rows[0].n).toBe(2);
  }, 15000);
  it("retains pending spend when settlement observes a rolled-back clock", async () => {
    const pending = await reserveMonthlyRequest("owner", url, body, now);
    const next = new Date("2026-10-01T00:00:05Z");
    await reserveMonthlyRequest("qa", url, body, next);
    await settleMonthlyRequest(pending, usage(), now);
    expect(await monthlyBudgetStatus("owner", next)).toMatchObject({ accountedUsd: .05 });
    expect((await sql("SELECT charged,settled FROM BudgetReceipt WHERE id=?", [pending!.id])).rows[0]).toMatchObject({ charged: 25000, settled: 0 });
    expect((await sql("SELECT latestMonth FROM BudgetMeta")).rows[0].latestMonth).toBe("2026-10");
    await settleMonthlyRequest(pending, usage(), next);
    await settleMonthlyRequest(pending, usage(1, 1), next);
    expect(await monthlyBudgetStatus("owner", next)).toMatchObject({ accountedUsd: .025425 });
  });
  it("commits settlement and its month watermark atomically", async () => {
    const pending = await reserveMonthlyRequest("owner", url, body, now);
    await sql("CREATE TRIGGER reject_month_update BEFORE UPDATE OF latestMonth ON BudgetMeta BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END");
    const next = new Date("2026-10-01T00:00:05Z");
    await settleMonthlyRequest(pending, usage(), next);
    expect((await sql("SELECT charged,settled FROM BudgetReceipt WHERE id=?", [pending!.id])).rows[0]).toMatchObject({ charged: 25000, settled: 0 });
    expect((await sql("SELECT COUNT(*) AS n FROM BudgetReceipt")).rows[0].n).toBe(1);
    expect((await sql("SELECT latestMonth FROM BudgetMeta")).rows[0].latestMonth).toBe("2026-09");
    expect(await monthlyBudgetStatus("owner", next)).toMatchObject({ accountedUsd: .025 });
  });
  it("halts after usage exceeds the price/bounds assumptions", async () => {
    const r = await reserveMonthlyRequest("owner", url, body, now);
    await settleMonthlyRequest(r, usage(200000, 30000), now);
    await expect(reserveMonthlyRequest("owner", url, body, now)).rejects.toThrow();
    expect(await monthlyBudgetStatus("owner", now)).toMatchObject({ available: false });
  });
  it.each([{ model: "unapproved-model" }, { tools: [{ type: "web_search" }] }, { input: [{ role: "user", content: [{ type: "input_image", image_url: "private" }] }] }, { max_output_tokens: 2201 }, { background: true }, { stream: true }, { store: true }, { service_tier: "priority" }, { previous_response_id: "hidden-context" }])("rejects unpriced wire capability %j without egress", async change => {
    const external = vi.fn(); vi.stubGlobal("fetch", external);
    await expect(createBoundedOpenAiFetch("owner")(url, { body: JSON.stringify({ ...payload, ...change }) })).rejects.toMatchObject({ name: "TiaMonthlyBudgetError" });
    expect(external).not.toHaveBeenCalled(); expect((await sql("SELECT COUNT(*) AS n FROM BudgetReceipt")).rows[0].n).toBe(0);
  });
  it("blocks different endpoints and a malformed ledger", async () => {
    await expect(reserveMonthlyRequest("owner", "https://example.invalid/responses", body, now)).rejects.toThrow();
    await sql("UPDATE BudgetMeta SET cap=9000000");
    await expect(reserveMonthlyRequest("owner", url, body, now)).rejects.toThrow();
  });
});
