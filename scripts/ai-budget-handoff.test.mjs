import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyFile, mkdtemp, readFile, realpath } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";
vi.mock("server-only", () => ({}));
const faults = vi.hoisted(() => ({ chmod: false, disk: false }));
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal();
  return {...actual, chmod: async (...args) => { if(faults.chmod) throw Error("synthetic export failure"); return actual.chmod(...args); },
    statfs: async (...args) => faults.disk ? {bavail:0n,bsize:4096n} : actual.statfs(...args) };
});
import { inspectBudget, freezeBudget, activateBudget, exportFrozenBudget } from "./ai-budget-handoff.mjs";
import { monthlyBudgetStatus, reserveMonthlyRequest, settleMonthlyRequest } from "../src/lib/ai-monthly-budget";
let source, snapshot, target, directory;
const now = new Date("2026-09-17T06:00:00Z");
const body = JSON.stringify({model:"gpt-5-mini",input:"SYNTHETIC ONLY",max_output_tokens:100,store:false,service_tier:"default"});
const url = "https://api.openai.com/v1/responses";
const normal = file => file.replaceAll("\\", "/");
async function sql(file, statement) {
  const db = createClient({url:pathToFileURL(file).href});
  try { return await db.execute(statement); } finally { db.close(); }
}
function policy(file) {
  vi.stubEnv("OPENAI_PERSONAL_USE","true"); vi.stubEnv("OPENAI_MONTHLY_BUDGET_USD","2");
  vi.stubEnv("OPENAI_ALLOWED_USER_IDS","synthetic"); vi.stubEnv("OPENAI_MODEL","gpt-5-mini");
  vi.stubEnv("OPENAI_BUDGET_DATABASE_FILE",file);
}
async function freeze() {
  return freezeBudget(source,snapshot,(await inspectBudget(source)).digest,hostname(),normal(target));
}
beforeEach(async () => {
  vi.stubGlobal("fetch",vi.fn(()=>{throw Error("Network forbidden");}));
  directory = await realpath(await mkdtemp(path.join(tmpdir(),"tia-handoff-test-")));
  source = path.join(directory,"source.db"); snapshot = path.join(directory,"snapshot.db"); target = path.join(directory,"target.db");
  const db=createClient({url:pathToFileURL(source).href});
  try {
    await db.executeMultiple(await readFile("scripts/ai-monthly-schema.sql","utf8"));
    await db.execute("INSERT INTO BudgetMeta VALUES(1,1,2000000,'2026-09',0)");
    await db.execute("INSERT INTO BudgetReceipt(id,month,charged,settled,createdAt) VALUES('previous','2026-09',156237,1,'synthetic')");
  } finally {db.close();}
  policy(source);
});
afterEach(()=>{faults.chmod=false;faults.disk=false;vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("one-authority budget handoff; synthetic only",()=>{
  it("inspection changes no bytes or metadata",async()=>{
    const before=await readFile(source); expect(await inspectBudget(source)).toMatchObject({receiptCount:1,chargedMicroUsd:156237,halted:false,version:1});
    expect(await readFile(source)).toEqual(before);
  });
  it("freezes before export and preserves settled AND uncertain spend",async()=>{
    const pending=await reserveMonthlyRequest("synthetic",url,body,now);
    const result=await freeze();
    expect(result).toMatchObject({sourceFrozen:true,activated:false,receiptCount:2,chargedMicroUsd:181237,pendingCount:1,version:2,halted:true});
    await expect(reserveMonthlyRequest("synthetic",url,body,now)).rejects.toThrow();
    await settleMonthlyRequest(pending,Response.json({usage:{input_tokens:1,output_tokens:1}}),now);
    expect((await inspectBudget(source)).digest).toBe(result.digest);
    expect((await inspectBudget(snapshot)).digest).toBe(result.digest);
  });
  it("activates only the bound fresh target; source and packet remain frozen",async()=>{
    const result=await freeze(); await activateBudget(snapshot,target,result.digest);
    policy(target); expect(await monthlyBudgetStatus("synthetic",now)).toMatchObject({available:true,accountedUsd:.156237});
    await reserveMonthlyRequest("synthetic",url,body,now);
    expect(await monthlyBudgetStatus("synthetic",now)).toMatchObject({accountedUsd:.181237});
    policy(source); expect(await monthlyBudgetStatus("synthetic",now)).toEqual({available:false,limitUsd:2});
    expect((await inspectBudget(snapshot)).halted).toBe(true);
  });
  it("does not refund on reactivation/retry or overwrite an existing destination",async()=>{
    const r=await freeze(); await activateBudget(snapshot,target,r.digest); policy(target);
    await reserveMonthlyRequest("synthetic",url,body,now); const before=(await inspectBudget(target)).digest;
    await expect(activateBudget(snapshot,target,r.digest)).rejects.toThrow();
    expect((await inspectBudget(target)).digest).toBe(before);
  });
  it("does not activate a duplicate copy at another path",async()=>{
    const r=await freeze(); await activateBudget(snapshot,target,r.digest);
    const duplicate=path.join(directory,"duplicate.db"); await copyFile(target,duplicate); policy(duplicate);
    await expect(reserveMonthlyRequest("synthetic",url,body,now)).rejects.toThrow();
    expect(await monthlyBudgetStatus("synthetic",now)).toEqual({available:false,limitUsd:2});
  });
  it("blocks mismatched host and destination before activation",async()=>{
    const r=await freezeBudget(source,snapshot,(await inspectBudget(source)).digest,"other-host.invalid",normal(target));
    await expect(activateBudget(snapshot,target,r.digest)).rejects.toThrow();
    await expect(activateBudget(snapshot,path.join(directory,"elsewhere.db"),r.digest)).rejects.toThrow();
  });
  it("fails closed if active authority is absent or altered",async()=>{
    const r=await freeze(); await activateBudget(snapshot,target,r.digest); policy(target);
    await sql(target,"UPDATE BudgetAuthority SET targetHost='other-host.invalid'");
    await expect(reserveMonthlyRequest("synthetic",url,body,now)).rejects.toThrow();
    await sql(target,"DROP TABLE BudgetAuthority");
    expect(await monthlyBudgetStatus("synthetic",now)).toEqual({available:false,limitUsd:2});
  });
  it("refuses stale review without freezing a changed ledger",async()=>{
    const reviewed=await inspectBudget(source); await reserveMonthlyRequest("synthetic",url,body,now);
    await expect(freezeBudget(source,snapshot,reviewed.digest,hostname(),normal(target))).rejects.toThrow();
    expect((await inspectBudget(source)).halted).toBe(false);
    expect((await inspectBudget(source)).version).toBe(1);
  });
  it("does not partially commit a rejected freeze transaction",async()=>{
    await sql(source,"CREATE TRIGGER block_snapshot_update BEFORE UPDATE ON BudgetMeta BEGIN SELECT RAISE(ABORT,'synthetic'); END");
    await expect(freeze()).rejects.toThrow();
    expect((await inspectBudget(source)).halted).toBe(false); // transaction never committed
    expect((await inspectBudget(source)).receiptCount).toBe(1);
  });
  it("keeps the source frozen after export failure and can export to a NEW packet",async()=>{
    faults.chmod=true; await expect(freeze()).rejects.toThrow();
    expect(await inspectBudget(source)).toMatchObject({halted:true,version:2,chargedMicroUsd:156237});
    faults.chmod=false;
    const retry=path.join(directory,"retry-packet.db"); const r=await exportFrozenBudget(source,retry);
    await activateBudget(retry,target,r.digest); policy(target);
    expect(await monthlyBudgetStatus("synthetic",now)).toMatchObject({available:true,accountedUsd:.156237});
    expect((await inspectBudget(source)).halted).toBe(true);
  });
  it("refuses insufficient disk space without freezing or activating",async()=>{
    faults.disk=true; await expect(freeze()).rejects.toThrow();
    expect((await inspectBudget(source)).halted).toBe(false);
    faults.disk=false; const r=await freeze(); faults.disk=true;
    await expect(activateBudget(snapshot,target,r.digest)).rejects.toThrow();
    expect((await inspectBudget(source)).halted).toBe(true);
  });
  it("rollback transfers the CURRENT ledger forward, never an older backup",async()=>{
    const first=await freeze(); await activateBudget(snapshot,target,first.digest); policy(target);
    await reserveMonthlyRequest("synthetic",url,body,now);
    const reverseTarget=path.join(directory,"new-local.db"), reverseSnapshot=path.join(directory,"reverse.db");
    const reverse=await freezeBudget(target,reverseSnapshot,(await inspectBudget(target)).digest,hostname(),normal(reverseTarget));
    await activateBudget(reverseSnapshot,reverseTarget,reverse.digest);
    policy(reverseTarget); expect(await monthlyBudgetStatus("synthetic",now)).toMatchObject({accountedUsd:.181237});
    policy(target); expect(await monthlyBudgetStatus("synthetic",now)).toEqual({available:false,limitUsd:2});
    policy(source); expect(await monthlyBudgetStatus("synthetic",now)).toEqual({available:false,limitUsd:2});
  });
  it.each(["invalid", "0".repeat(64)])("rejects wrong activation digest %s",async bad=>{
    await freeze(); await expect(activateBudget(snapshot,target,bad)).rejects.toThrow();
    expect((await inspectBudget(source)).halted).toBe(true);
  });
  it("rejects a changed export, live source and existing snapshot",async()=>{
    await expect(activateBudget(source,target,(await inspectBudget(source)).digest)).rejects.toThrow();
    const r=await freeze(); await sql(snapshot,"UPDATE BudgetReceipt SET charged=0");
    await expect(activateBudget(snapshot,target,r.digest)).rejects.toThrow();
    await expect(freeze()).rejects.toThrow();
  });
  it("carries uncertain spend and the clock guard into the next month",async()=>{
    await reserveMonthlyRequest("synthetic",url,body,now);
    const r=await freeze(); await activateBudget(snapshot,target,r.digest); policy(target);
    const next=new Date("2026-10-01T00:00:01Z");
    expect(await monthlyBudgetStatus("synthetic",next)).toMatchObject({accountedUsd:.025});
    await reserveMonthlyRequest("synthetic",url,body,next);
    await expect(reserveMonthlyRequest("synthetic",url,body,now)).rejects.toThrow();
  });
  it("preserves authority and spend in a fresh process after restart",async()=>{
    const r=await freeze(); await activateBudget(snapshot,target,r.digest); policy(target);
    const moduleUrl=pathToFileURL(path.resolve("src/lib/ai-monthly-budget.ts")).href;
    const program=`import {reserveMonthlyRequest} from ${JSON.stringify(moduleUrl)};try{await reserveMonthlyRequest('synthetic',${JSON.stringify(url)},${JSON.stringify(body)},new Date(${JSON.stringify(now.toISOString())}));console.log('reserved')}catch{console.log('blocked')}`;
    const run=file=>promisify(execFile)(process.execPath,["--conditions=react-server","--input-type=module","-e",program],{env:{...process.env,OPENAI_BUDGET_DATABASE_FILE:file},windowsHide:true});
    expect((await run(source)).stdout.trim()).toBe("blocked");
    expect((await run(target)).stdout.trim()).toBe("reserved");
    expect((await inspectBudget(target)).chargedMicroUsd).toBe(181237);
  },15000);
  it("serializes two freezes; only one can consume the reviewed source",async()=>{
    const expected=(await inspectBudget(source)).digest;
    const outcomes=await Promise.allSettled([freezeBudget(source,snapshot,expected,hostname(),normal(target)),freezeBudget(source,path.join(directory,"another.db"),expected,hostname(),normal(target))]);
    expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);
    expect((await inspectBudget(source)).receiptCount).toBe(1);
  });
});
