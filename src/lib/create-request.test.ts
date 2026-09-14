import { describe, expect, it, vi } from "vitest";
import { createExactlyOnce, createFailure, createRequestIdentity } from "./create-request";
import { createSubmissionController } from "./create-submission";

const key = "synthetic-test-key-1234";
const identity = (payload: unknown = { title: "کار ساختگی" }, user = "owner", kind: "Task" | "Meeting" = "Task") => createRequestIdentity(key, user, kind, payload)!;
function fixture() {
  let receipt: { id: string; userId: string; entityType: string; entityId: string; input: string } | null = null;
  let item: { id: string; done: boolean } | null = null;
  const tx = { auditLog: { findUnique: vi.fn(async () => receipt), create: vi.fn(async ({ data }) => { receipt = data; }) } };
  const database = { $transaction: vi.fn(async (fn) => fn(tx)) } as unknown as Parameters<typeof createExactlyOnce>[0];
  const create = vi.fn(async () => item = { id: "record-id", done: false });
  const find = vi.fn(async () => item);
  return { database, tx, create, find, setItem: (value: typeof item) => { item = value; }, run: (value = identity()) => createExactlyOnce(database, value, create, find) };
}
describe("durable manual-create receipts", () => {
  it("canonicalizes field order and ignores omitted undefined values", () => expect(identity({ b: 2, a: 1, c: undefined }).digest).toBe(identity({ a: 1, b: 2 }).digest));
  it("isolates users but preserves the key if an uncertain form changes resource kind", () => {
    expect(identity().id).not.toBe(identity(undefined, "other").id);
    expect(identity().id).toBe(identity(undefined, "owner", "Meeting").id);
  });
  it("accepts legacy missing keys without pretending they are deduplicated", () => expect(createRequestIdentity(null, "owner", "Task", {})).toBeNull());
  it.each(["", "short", "x".repeat(101), "synthetic bad/key"]) ("rejects malformed keys %s", value => expect(() => createRequestIdentity(value, "owner", "Task", {})).toThrow());
  it("replays without recreating reminders/calendar/audit", async () => {
    const f = fixture(); expect(await f.run()).toEqual(await f.run()); expect(f.create).toHaveBeenCalledTimes(1); expect(f.tx.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("rejects changed payload on the same key", async () => {
    const f = fixture(); await f.run(); await expect(f.run(identity({ title: "متفاوت" }))).rejects.toMatchObject({ status: 409 }); expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("rejects changed resource kind after an uncertain response", async () => {
    const f = fixture(); await f.run(); await expect(f.run(identity(undefined, "owner", "Meeting"))).rejects.toMatchObject({ status: 409 }); expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("does not resurrect a missing/deleted record", async () => {
    const f = fixture(); await f.run(); f.setItem(null); await expect(f.run()).rejects.toMatchObject({ status: 409 }); expect(f.create).toHaveBeenCalledTimes(1);
  });
  it("returns current completion without changing it", async () => {
    const f = fixture(); await f.run(); f.setItem({ id: "record-id", done: true }); expect(await f.run()).toMatchObject({ done: true });
  });
  it("does not expose database details on failure", async () => {
    const response = createFailure(new Error("private database path/token")); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
});
describe("one form submission across rapid clicks and uncertain responses", () => {
  it("blocks concurrency and resets only for a new composer", () => {
    const f = createSubmissionController(() => key); expect(f.begin()).toBe(key); expect(f.begin()).toBeNull(); expect(f.reset()).toBe(false);
    f.finish(true); expect(f.begin()).toBeNull(); f.finish(false); expect(f.begin()).toBeNull(); expect(f.reset()).toBe(true); expect(f.begin()).toBe(key);
  });
  it("retains the exact key after a lost response", () => {
    let sequence = 0; const f = createSubmissionController(() => `${++sequence}`); expect(f.begin()).toBe("1"); f.finish(false); expect(f.begin()).toBe("1"); f.finish(true); f.reset(); expect(f.begin()).toBe("2");
  });
});
