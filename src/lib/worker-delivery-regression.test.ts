import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: {} as Record<string, unknown>, push: vi.fn(), call: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: (_target, key: string) => mocks.db[key] }) }));
vi.mock("@/lib/push", () => ({ sendWebPush: mocks.push }));
vi.mock("@/lib/outbound-calls", () => ({ sendUrgentVoiceCall: mocks.call }));
import { POST } from "@/app/api/internal/reminders/route";
import { syncUserEscalations } from "./escalation-service";

type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; create?: Row; update?: Row };
type Tables = Record<"reminder" | "escalationAttempt" | "notification" | "auditLog", Row[]>;
const now = new Date("2026-09-20T12:00:00Z");
let tables: Tables, task: Row, preference: Row, subscriptions: Row[];
let transactionDepth = 0;
let failCommit: "before" | "after" | null, afterCommit: (() => void) | null, afterDueRead: (() => void) | null;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return (expected as Row[]).some(filter => matches(row, filter));
    if (key === "AND") return (expected as Row[]).every(filter => matches(row, filter));
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      const filter = expected as Row;
      if ("is" in filter) return !!actual && matches(actual as Row, filter.is as Row);
      if ("in" in filter) return (filter.in as unknown[]).includes(actual);
      if ("not" in filter) return actual !== filter.not;
      if ("lte" in filter) return Number(actual) <= Number(filter.lte);
      if ("gt" in filter) return Number(actual) > Number(filter.gt);
      if ("gte" in filter) return Number(actual) >= Number(filter.gte);
      if ("contains" in filter) return typeof actual === "string" && actual.includes(String(filter.contains));
      if ("startsWith" in filter) return typeof actual === "string" && actual.startsWith(String(filter.startsWith));
      return !!actual && matches(actual as Row, filter);
    }
    return actual === expected;
  });
}
function materialize(row: Row): Row {
  return { ...row, task: row.taskId ? structuredClone(task) : null, meeting: null, user: { id: row.userId, pushSubscriptions: structuredClone(subscriptions) } };
}
function delegate(name: keyof Tables) {
  const selected = (query: Query) => tables[name].filter(row => matches(materialize(row), query.where));
  return {
    findMany: vi.fn(async (query: Query = {}) => {
      const result = structuredClone(selected(query).map(materialize));
      if (query.where?.status === "PENDING" && afterDueRead) { const hook = afterDueRead; afterDueRead = null; hook(); }
      return result;
    }),
    findFirst: vi.fn(async (query: Query) => { const row = selected(query)[0]; return row ? structuredClone(materialize(row)) : null; }),
    count: vi.fn(async (query: Query) => selected(query).length),
    updateMany: vi.fn(async (query: Query) => { const rows = selected(query); rows.forEach(row => Object.assign(row, query.data)); return { count: rows.length }; }),
    update: vi.fn(async (query: Query) => { const row = selected(query)[0]; if (!row) throw Error("missing synthetic row"); Object.assign(row, query.data); return structuredClone(materialize(row)); }),
    create: vi.fn(async (query: Query) => { const row = { id: `synthetic-${name}-${tables[name].length}`, ...query.data }; tables[name].push(row); return structuredClone(row); }),
    upsert: vi.fn(async (query: Query) => { const row = selected(query)[0]; if (row) { Object.assign(row, query.update); return structuredClone(row); } const created = { id: `synthetic-${name}-${tables[name].length}`, createdAt: new Date(), ...query.create }; tables[name].push(created); return structuredClone(created); }),
  };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.stubEnv("CRON_SECRET", "synthetic-worker-only");
  task = { id: "task-1", userId: "owner", title: "ساختگی", priority: "URGENT", status: "TODO", dueAt: new Date(now.getTime() - 60000), updatedAt: new Date(now.getTime() - 3600000), alertPolicy: null };
  preference = { urgentEscalationEnabled: true, callEscalationEnabled: true, smsEscalationEnabled: true, highPriorityEnabled: true, timezone: "UTC", quietHoursStartsAt: "00:00", quietHoursEndsAt: "00:00", emergencyPhone: "synthetic-recipient" };
  subscriptions = [{ id: "subscription-1", userId: "owner", endpoint: "https://example.invalid/synthetic", p256dh: "synthetic", auth: "synthetic" }];
  tables = { reminder: [{ id: "reminder-1", userId: "owner", taskId: "task-1", meetingId: null, channel: "PUSH", scheduledFor: now, status: "PENDING", lastError: null, sentAt: null }], escalationAttempt: [{ id: "attempt-1", userId: "owner", taskId: "task-1", level: "IN_APP_PUSH", scheduledFor: now, status: "PENDING", lastError: null, sentAt: null, metadata: '{"quietHoursRetired":true}', createdAt: now }], notification: [], auditLog: [] };
  failCommit = null; afterCommit = afterDueRead = null; transactionDepth = 0;
  let tail = Promise.resolve();
  mocks.db = {
    ...Object.fromEntries(Object.keys(tables).map(key => [key, delegate(key as keyof Tables)])),
    userPreference: { findUnique: vi.fn(async () => structuredClone(preference)) },
    task: { findMany: vi.fn(async () => []), findFirst: vi.fn(async (query: Query) => matches(task, query.where) ? structuredClone(task) : null) },
    $transaction: async (callback: ((tx: typeof mocks.db) => Promise<unknown>) | Promise<unknown>[]) => {
      if (Array.isArray(callback)) return Promise.all(callback);
      const previous = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; });
      await previous; transactionDepth++; const before = structuredClone(tables); let committed = false;
      try {
        const result = await callback(mocks.db);
        if (failCommit === "before") { failCommit = null; throw Error("synthetic interruption before commit"); }
        committed = true;
        if (afterCommit) { const hook = afterCommit; afterCommit = null; hook(); }
        if (failCommit === "after") { failCommit = null; throw Error("synthetic lost commit acknowledgement"); }
        return result;
      } catch (error) { if (!committed) tables = before; throw error; }
      finally { transactionDepth--; release(); }
    },
  };
  mocks.push.mockResolvedValue({ sent: true });
  mocks.call.mockResolvedValue({ transmitted: false, mode: "mock", provider: "mock", reason: "delivery-disabled" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
type Kind = "reminder" | "escalationAttempt";
async function run(kind: Kind) {
  if (kind === "escalationAttempt") return syncUserEscalations("owner");
  const response = await POST(new Request("http://localhost:3999/api/internal/reminders", { method: "POST", headers: { authorization: "Bearer synthetic-worker-only" } }));
  return response.json();
}

describe.each(["reminder", "escalationAttempt"] as const)("%s delivery transactions", kind => {
  it("rolls back an interrupted claim and delivers once on the next run", async () => {
    failCommit = "before"; await run(kind).catch(() => {});
    expect(tables[kind][0].status).toBe("PENDING"); expect(tables.notification).toHaveLength(0); expect(mocks.push).not.toHaveBeenCalled();
    await run(kind); await run(kind);
    expect(tables.notification).toHaveLength(1); expect(mocks.push).toHaveBeenCalledOnce();
  });
  it("keeps the in-app notice when commit acknowledgement is lost and never retries external delivery", async () => {
    failCommit = "after"; await run(kind).catch(() => {});
    expect(tables.notification).toHaveLength(1); expect(tables[kind][0].status).toBe("PARTIAL");
    expect(tables[kind][0].lastError).toContain("DELIVERY_UNCERTAIN");
    await run(kind); expect(mocks.push).not.toHaveBeenCalled(); expect(tables.notification).toHaveLength(1);
  });
  it("commits one deterministic in-app notice before egress under concurrent runs", async () => {
    mocks.push.mockImplementation(async () => {
      expect(tables.notification).toHaveLength(1);
      expect(tables.notification[0].id).toBe(`${kind === "reminder" ? "reminder" : "escalation"}:${tables[kind][0].id}`);
      expect(tables[kind][0].status).toBe("PARTIAL"); return { sent: true };
    });
    await Promise.all([run(kind), run(kind)]);
    expect(tables.notification).toHaveLength(1); expect(mocks.push).toHaveBeenCalledOnce(); expect(tables[kind][0].status).toBe("SENT");
  });
  it("keeps uncertainty if settlement fails after an external success, without resending", async () => {
    mocks.push.mockImplementation(async () => { failCommit = "before"; return { sent: true }; });
    await run(kind).catch(() => {}); expect(tables[kind][0].status).toBe("PARTIAL");
    await run(kind); expect(mocks.push).toHaveBeenCalledOnce(); expect(tables.notification).toHaveLength(1);
  });
  it.each(["DONE", "CANCELLED"])("checks a parent changed to %s after the due scan", async status => {
    afterDueRead = () => { task.status = status; };
    await run(kind); expect(mocks.push).not.toHaveBeenCalled(); expect(tables.notification).toHaveLength(0); expect(tables[kind][0].status).toBe("CANCELLED");
  });
  it("rejects a mismatched parent owner inside the transaction", async () => {
    task.userId = "someone-else"; await run(kind);
    expect(mocks.push).not.toHaveBeenCalled(); expect(tables.notification).toHaveLength(0);
  });
  it("cancels before egress when completion follows commit", async () => {
    afterCommit = () => { task.status = "DONE"; };
    await run(kind); expect(mocks.push).not.toHaveBeenCalled(); expect(tables[kind][0].status).toBe("CANCELLED");
  });
  it("never overwrites cancellation while external delivery is in flight", async () => {
    mocks.push.mockImplementation(async () => { task.status = "DONE"; tables[kind][0].status = "CANCELLED"; return { sent: true }; });
    await run(kind); expect(tables[kind][0].status).toBe("CANCELLED"); expect(mocks.push).toHaveBeenCalledOnce();
  });
  it("does not call a fulfilled sent:false result a successful push", async () => {
    mocks.push.mockResolvedValue({ sent: false, reason: "VAPID_NOT_CONFIGURED" });
    await run(kind); await run(kind); expect(tables[kind][0].status).toBe("PARTIAL"); expect(mocks.push).toHaveBeenCalledOnce();
  });
  it("does not retry a rejected push or expose its private error", async () => {
    mocks.push.mockRejectedValue(Error("private-provider-secret"));
    await run(kind); await run(kind); expect(tables[kind][0].status).toBe("PARTIAL"); expect(mocks.push).toHaveBeenCalledOnce();
    expect(JSON.stringify(tables)).not.toContain("private-provider-secret");
  });
  it("preserves and reports legacy PROCESSING without inventing or replaying effects", async () => {
    tables[kind][0].status = "PROCESSING"; const before = structuredClone(tables[kind][0]);
    const result = await run(kind);
    expect(JSON.stringify(result)).toContain('"legacyProcessing":1');
    expect(tables[kind][0]).toEqual(before); expect(mocks.push).not.toHaveBeenCalled(); expect(tables.notification).toHaveLength(0);
  });
  it("does not claim external success with no subscriptions", async () => {
    subscriptions = []; await run(kind); expect(tables[kind][0].status).toBe("PARTIAL"); expect(mocks.push).not.toHaveBeenCalled(); expect(tables.notification).toHaveLength(1);
  });
  it("records mixed per-destination outcomes without retrying any destination", async () => {
    subscriptions.push({ ...subscriptions[0], id: "subscription-2" }, { ...subscriptions[0], id: "subscription-3" });
    mocks.push.mockResolvedValueOnce({ sent: true }).mockResolvedValueOnce({ sent: false }).mockRejectedValueOnce(Error("private-error"));
    await run(kind); await run(kind);
    expect(mocks.push).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(tables[kind][0].lastError)).push).toEqual([
      { id: "subscription-1", status: "SENT" }, { id: "subscription-2", status: "NOT_SENT" }, { id: "subscription-3", status: "DELIVERY_UNCERTAIN" },
    ]);
  });
  it("reuses an existing deterministic in-app receipt without overwriting it", async () => {
    const notice = { id: `${kind === "reminder" ? "reminder" : "escalation"}:${tables[kind][0].id}`, userId: "owner", body: "preserved history" };
    tables.notification.push(notice); await run(kind);
    expect(tables.notification).toEqual([notice]);
  });
});

describe("optional escalation calls and SMS", () => {
  it("keeps a call with unknown outcome at one attempt", async () => {
    tables.escalationAttempt[0].level = "CALL"; mocks.call.mockRejectedValue(Error("private-call-error"));
    await run("escalationAttempt"); await run("escalationAttempt");
    expect(mocks.call).toHaveBeenCalledOnce(); expect(tables.escalationAttempt[0].status).toBe("PARTIAL");
    expect(tables.escalationAttempt[0].lastError).toContain("DELIVERY_UNCERTAIN"); expect(JSON.stringify(tables)).not.toContain("private-call-error");
  });
  it.each(["CALL", "CALL_MOCK"])("preserves one simulated %s and its audit", async level => {
    tables.escalationAttempt[0].level = level; await run("escalationAttempt"); await run("escalationAttempt");
    expect(mocks.call).toHaveBeenCalledOnce(); expect(tables.escalationAttempt[0].status).toBe("SIMULATED"); expect(tables.auditLog).toHaveLength(1);
  });
  it("keeps SMS a single recorded simulation", async () => {
    tables.escalationAttempt[0].level = "SMS_MOCK"; await run("escalationAttempt"); await run("escalationAttempt");
    expect(tables.escalationAttempt[0].status).toBe("SIMULATED"); expect(tables.auditLog).toHaveLength(1); expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("keeps a successful call uncertain if its settlement is interrupted", async () => {
    tables.escalationAttempt[0].level = "CALL";
    mocks.call.mockImplementation(async () => { failCommit = "before"; return { transmitted: true, mode: "live", provider: "mock", reason: "ready" }; });
    await run("escalationAttempt"); await run("escalationAttempt");
    expect(mocks.call).toHaveBeenCalledOnce(); expect(tables.escalationAttempt[0].status).toBe("PARTIAL"); expect(tables.auditLog).toHaveLength(0);
  });
  it("does not dispatch a call if it was disabled after the claim commit", async () => {
    tables.escalationAttempt[0].level = "CALL"; afterCommit = () => { preference.callEscalationEnabled = false; };
    await run("escalationAttempt"); expect(mocks.call).not.toHaveBeenCalled(); expect(tables.escalationAttempt[0].status).toBe("CANCELLED");
  });
  it("does not overwrite cancellation with a successful call settlement", async () => {
    tables.escalationAttempt[0].level = "CALL";
    mocks.call.mockImplementation(async () => { task.status = "DONE"; tables.escalationAttempt[0].status = "CANCELLED"; return { transmitted: true, mode: "live", provider: "mock", reason: "ready" }; });
    await run("escalationAttempt"); expect(tables.escalationAttempt[0].status).toBe("CANCELLED"); expect(tables.auditLog).toHaveLength(0);
  });
  it("leaves legacy claims untouched even when policy is disabled", async () => {
    preference.urgentEscalationEnabled = false; tables.escalationAttempt[0].status = "PROCESSING";
    const original = structuredClone(tables.escalationAttempt[0]);
    expect(await run("escalationAttempt")).toMatchObject({ legacyProcessing: 1 });
    expect(tables.escalationAttempt[0]).toEqual(original); expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
  });
  it("preserves an approved in-app-only escalation without requiring push", async () => {
    task.alertPolicy = JSON.stringify({ timezone: "UTC", quietStart: "00:00", quietEnd: "00:00", reminderOffsets: [], channels: ["IN_APP"], escalation: true, repeatCount: 0, repeatMinutes: 15 });
    await run("escalationAttempt"); expect(tables.escalationAttempt[0].status).toBe("SENT"); expect(tables.notification).toHaveLength(1); expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("terminal web-only escalation chains", () => {
  function terminalChain() {
    tables.escalationAttempt[0].status = "SENT";
    tables.escalationAttempt[0].createdAt = new Date(now.getTime() - 60000);
    task.updatedAt = now;
    preference.androidAlarmEnabled = preference.highPriorityEnabled = preference.callEscalationEnabled = preference.smsEscalationEnabled = false;
    (mocks.db.task as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([structuredClone(task)]);
  }
  it("does not replay a fully delivered chain after only a title edit", async () => {
    terminalChain(); task.title = "عنوان تازه";
    tables.auditLog.push({ id: "title-receipt", userId: "owner", entityId: "task-1", entityType: "Task", action: "TASK_UPDATED", input: '{"title":"عنوان تازه"}', result: null, createdAt: now });
    await run("escalationAttempt"); await run("escalationAttempt");
    expect(tables.escalationAttempt).toHaveLength(1); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("consumes an explicit schedule-change receipt once without altering historical times", async () => {
    terminalChain(); const history = structuredClone(tables.escalationAttempt[0]);
    tables.auditLog.push({ id: "schedule-receipt", userId: "owner", entityId: "task-1", entityType: "Task", action: "TASK_UPDATED", result: '{"escalationScheduleChanged":true}', createdAt: now });
    await run("escalationAttempt");
    task.updatedAt = new Date(now.getTime() + 1000);
    (mocks.db.task as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([structuredClone(task)]);
    await run("escalationAttempt");
    expect(tables.escalationAttempt).toHaveLength(2); expect(mocks.push).toHaveBeenCalledOnce(); expect(tables.escalationAttempt[0]).toEqual(history);
  });
  it("preserves the meaningful confirmed AGENT_UPDATE path and ignores later title-only reviews", async () => {
    terminalChain();
    // Only the audit time authorizes the change; the task's timestamp is not a scheduling receipt.
    task.updatedAt = new Date(now.getTime() - 120000);
    (mocks.db.task as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([structuredClone(task)]);
    tables.auditLog.push({ id: "agent-schedule", userId: "owner", entityId: "task-1", entityType: "TASK", action: "AGENT_UPDATE", source: "CONFIRMED_AGENT", result: JSON.stringify({ draftId: "synthetic-draft", revision: 2, reminders: 1, escalationScheduleChanged: true }), createdAt: now });
    await run("escalationAttempt");
    tables.auditLog.push({ id: "agent-title", userId: "owner", entityId: "task-1", entityType: "TASK", action: "AGENT_UPDATE", source: "CONFIRMED_AGENT", result: JSON.stringify({ draftId: "synthetic-title-draft", revision: 1, reminders: 1, escalationScheduleChanged: false }), createdAt: new Date(now.getTime() + 1000) });
    await run("escalationAttempt");
    expect(tables.escalationAttempt).toHaveLength(2); expect(mocks.push).toHaveBeenCalledOnce();
  });
  it.each(["unmarked-agent", "foreign-owner", "old-receipt"])("does not use %s as fresh schedule authorization", async variant => {
    terminalChain();
    tables.auditLog.push({ id: "not-authorized", userId: variant === "foreign-owner" ? "other-owner" : "owner", entityId: "task-1", entityType: "TASK", action: "AGENT_UPDATE", source: "CONFIRMED_AGENT", result: JSON.stringify({ draftId: "synthetic", revision: 1, ...(variant === "unmarked-agent" ? {} : { escalationScheduleChanged: true }) }), createdAt: new Date(now.getTime() - (variant === "old-receipt" ? 120000 : 0)) });
    await run("escalationAttempt"); expect(tables.escalationAttempt).toHaveLength(1); expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("atomic escalation seeding", () => {
  function candidates() {
    tables.escalationAttempt = [];
    preference = { ...preference, urgentMaxRepeats: 0, androidAlarmEnabled: false, highPriorityEnabled: false, callEscalationEnabled: false, smsEscalationEnabled: false };
    return mocks.db.task as { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  }
  it("does not insert a stale chain after a due edit and seeds exactly once at the new due time", async () => {
    const port = candidates(), later = new Date(now.getTime() + 3600000);
    port.findMany.mockImplementationOnce(async () => {
      const stale = structuredClone(task);
      task.dueAt = later;
      tables.auditLog.push({ id: "concurrent-due-edit", userId: "owner", entityId: task.id, action: "TASK_UPDATED", entityType: "Task", result: '{"escalationScheduleChanged":true}', createdAt: new Date() });
      return [stale];
    });
    await run("escalationAttempt");
    expect(tables.escalationAttempt).toHaveLength(0); expect(mocks.push).not.toHaveBeenCalled();
    vi.setSystemTime(later); port.findMany.mockResolvedValue([structuredClone(task)]);
    await run("escalationAttempt"); await run("escalationAttempt");
    expect(tables.escalationAttempt).toHaveLength(1); expect(mocks.push).toHaveBeenCalledOnce();
  });
  it.each(["owner", "completed", "disabled-policy"])("rechecks %s after the candidate snapshot", async variant => {
    const port = candidates();
    port.findMany.mockImplementationOnce(async () => {
      const stale = structuredClone(task);
      if (variant === "owner") task.userId = "other";
      else if (variant === "completed") task.status = "DONE";
      else preference.urgentEscalationEnabled = false;
      return [stale];
    });
    await run("escalationAttempt");
    expect(tables.escalationAttempt).toHaveLength(0); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("reads task authorization and writes the chain only inside one transaction", async () => {
    const port = candidates(); port.findMany.mockResolvedValue([structuredClone(task)]);
    port.findFirst.mockImplementation(async (query: Query) => { expect(transactionDepth).toBe(1); return matches(task, query.where) ? structuredClone(task) : null; });
    const attempts = mocks.db.escalationAttempt as { upsert: ReturnType<typeof vi.fn> };
    const insert = attempts.upsert.getMockImplementation() as (query: Query) => Promise<Row>;
    attempts.upsert.mockImplementation(async (query: Query) => { expect(transactionDepth).toBe(1); return insert(query); });
    await run("escalationAttempt");
    expect(port.findFirst).toHaveBeenCalled(); expect(attempts.upsert).toHaveBeenCalledOnce();
  });
});
