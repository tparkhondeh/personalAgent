import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "./agent-planner";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
import { executeDraft, previewPlan } from "./agent-drafts";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
const now = new Date("2030-01-01T08:00:00Z");
function matches(row: Row, where: Where) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) return (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
}
function fixture(operation: Plan["operation"] = "UPDATE", entity: Plan["entity"] = "TASK", changes: Partial<Plan> = {}) {
  const plan: Plan = {
    operation, entity, targetId: operation === "CREATE" ? null : "target", targetUpdatedAt: now.toISOString(),
    title: "Reviewed title", category: "WORK", priority: "URGENT", date: "2030-01-02", time: "12:00", timezone: "UTC",
    ambiguousTime: null, durationMinutes: 60, recurrence: "NONE", occurrenceCount: null,
    reminderOffsets: [0, 30], channels: ["IN_APP", "ALARM"], repeatCount: 1, repeatMinutes: 15,
    quietStart: "22:00", quietEnd: "07:00", escalation: entity === "TASK", defaults: [], ...changes,
  };
  const preview = previewPlan(plan, [], now);
  const targetField = entity === "TASK" ? "taskId" : "meetingId";
  const device = (id: string, channel: string, status: string, extra: Row = {}) => ({ id, userId: "owner", [targetField]: "target", channel, status, ...extra });
  const attempt = (id: string, level: string, status: string, extra: Row = {}) => ({ id, userId: "owner", taskId: "target", level, status, ...extra });
  const state = {
    draft: { id: "draft", userId: "owner", revision: 1, status: "PENDING", expiresAt: new Date("2030-01-01T09:00:00Z"), payload: JSON.stringify(plan), preview: JSON.stringify(preview), result: null as string | null },
    target: { id: "target", userId: "owner", title: "Previous title", category: "WORK", priority: "URGENT", dueAt: new Date("2030-01-02T12:00:00Z"), updatedAt: now, alertPolicy: JSON.stringify(preview.policy), status: entity === "TASK" ? "TODO" : "SCHEDULED" } as Row,
    reminders: [device("alarm", "ALARM", "DEVICE_PENDING"), device("native", "NATIVE", "SENT"), device("old-device", "ALARM", "CANCELLED"), device("in-app", "IN_APP", "PENDING"), device("foreign-device", "ALARM", "DEVICE_PENDING", { userId: "other" }), device("unrelated-device", "ALARM", "DEVICE_PENDING", { [targetField]: "unrelated" })],
    attempts: [attempt("alarm-attempt", "ANDROID_ALARM", "SCHEDULED"), attempt("pending-attempt", "ANDROID_ALARM", "PENDING"), attempt("old-attempt", "ANDROID_ALARM", "CANCELLED"), attempt("sent-attempt", "ANDROID_ALARM", "SENT"), attempt("push-attempt", "WEB_PUSH", "PENDING"), attempt("foreign-attempt", "ANDROID_ALARM", "SCHEDULED", { userId: "other" }), attempt("unrelated-attempt", "ANDROID_ALARM", "SCHEDULED", { taskId: "unrelated" })],
    audit: [] as Row[], created: [] as Row[],
  };
  const rows = (key: "reminders" | "attempts") => ({
    findMany: vi.fn(async ({ where }: { where: Where }) => state[key].filter(row => matches(row, where)).map(row => ({ ...row }))),
    updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => {
      const found = state[key].filter(row => matches(row, where));
      found.forEach(row => Object.assign(row, data)); return { count: found.length };
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => { const collection: Row[] = state[key]; collection.push(...data.map((row, i) => ({ ...row, id: `new-${i}` }))); return { count: data.length }; }),
  });
  const entityPort = () => ({
    findFirst: vi.fn(async ({ where }: { where: Where }) => matches(state.target, where) ? { ...state.target } : null),
    update: vi.fn(async ({ data }: { data: Row }) => Object.assign(state.target, data)),
    create: vi.fn(async ({ data }: { data: Row }) => { const row = { ...data, id: `created-${state.created.length}` }; state.created.push(row); return row; }),
  });
  const tx = {
    agentDraft: {
      findFirst: vi.fn(async ({ where }: { where: Where }) => matches(state.draft, where) ? { ...state.draft } : null),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: Row }) => { if (!matches(state.draft, where)) return { count: 0 }; Object.assign(state.draft, data); return { count: 1 }; }),
      update: vi.fn(async ({ data }: { data: Row }) => Object.assign(state.draft, data)),
    },
    task: entityPort(), meeting: entityPort(), reminder: rows("reminders"), escalationAttempt: rows("attempts"),
    calendarEvent: { create: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn(async ({ data }: { data: Row }) => { state.audit.push(data); }) },
  };
  // Synthetic in-memory transaction only; every database access must use this port.
  mocks.transaction.mockImplementation(async (callback: (port: typeof tx) => Promise<unknown>) => {
    const before = structuredClone(state);
    try { return await callback(tx); } catch (error) { Object.assign(state, before); throw error; }
  });
  return { state, tx, plan, confirm: (owner = "owner", revision = 1) => executeDraft(owner, "draft", revision) };
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in draft unit tests"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("confirmed draft cancellation receipts", () => {
  it.each(["TASK", "MEETING"] as const)("CREATE %s persists empty receipts and reuses them on retry", async entity => {
    const f = fixture("CREATE", entity);
    const result = await f.confirm();
    expect(result.meta).toEqual({ cancelledDeviceReminderIds: [], cancelledEscalationAttemptIds: [] });
    expect(JSON.parse(f.state.draft.result!).meta).toEqual(result.meta);
    expect(await f.confirm()).toEqual(result);
    expect(f.state.created).toHaveLength(1);
    expect(f.tx.reminder.findMany).not.toHaveBeenCalled();
    expect(f.tx.escalationAttempt.updateMany).not.toHaveBeenCalled();
  });

  it.each(["TASK", "MEETING"] as const)("%s mutations return only owned prior device IDs and durable retry receipts", async entity => {
    for (const operation of ["UPDATE", "COMPLETE", "DELETE"] as const) {
      const f = fixture(operation, entity, { time: "13:00" });
      const result = await f.confirm();
      expect(result.meta.cancelledDeviceReminderIds).toEqual(["alarm", "native", "old-device"]);
      expect(result.meta.cancelledEscalationAttemptIds).toEqual(entity === "TASK" ? ["alarm-attempt", "pending-attempt", "old-attempt"] : []);
      expect(f.state.reminders.find(row => row.id === "foreign-device")?.status).toBe("DEVICE_PENDING");
      expect(f.state.reminders.find(row => row.id === "unrelated-device")?.status).toBe("DEVICE_PENDING");
      expect(f.state.attempts.find(row => row.id === "foreign-attempt")?.status).toBe("SCHEDULED");
      expect(f.state.attempts.find(row => row.id === "unrelated-attempt")?.status).toBe("SCHEDULED");
      const calls = f.tx.reminder.updateMany.mock.calls.length;
      // Simulate lost response followed by retry after underlying rows have moved on.
      f.state.reminders = []; f.state.attempts = [];
      f.state.draft.expiresAt = now;
      expect(await f.confirm()).toEqual(result);
      expect(f.tx.reminder.updateMany).toHaveBeenCalledTimes(calls);
      expect(f.state.audit).toHaveLength(1);
    }
  });

  it.each(["key order", "set order", "default timezone"])("title-only UPDATE preserves escalation with equivalent policy: %s", async variant => {
    const f = fixture("UPDATE", "TASK", variant === "default timezone" ? { timezone: "Asia/Tehran" } : {});
    const policy = JSON.parse(f.state.target.alertPolicy as string);
    if (variant === "set order") { policy.channels.reverse(); policy.reminderOffsets.reverse(); }
    if (variant === "default timezone") { delete policy.timezone; f.state.target.dueAt = new Date("2030-01-02T08:30:00Z"); }
    f.state.target.alertPolicy = JSON.stringify(Object.fromEntries(Object.entries(policy).reverse()));
    const result = await f.confirm();
    expect(f.tx.escalationAttempt.updateMany).not.toHaveBeenCalled();
    expect(f.state.attempts.find(row => row.id === "alarm-attempt")?.status).toBe("SCHEDULED");
    expect(result.meta.cancelledEscalationAttemptIds).toEqual(["old-attempt"]);
    expect(JSON.parse(f.state.audit[0].result as string)).not.toHaveProperty("escalationScheduleChanged");
  });

  it.each(["dueAt", "priority", "policy"])("TASK UPDATE marks and cancels an actual %s change", async field => {
    const f = fixture();
    if (field === "dueAt") f.state.target.dueAt = new Date("2030-01-02T11:00:00Z");
    if (field === "priority") f.state.target.priority = "NORMAL";
    if (field === "policy") f.state.target.alertPolicy = JSON.stringify({ ...JSON.parse(f.state.target.alertPolicy as string), repeatCount: 0 });
    const result = await f.confirm();
    expect(f.state.audit[0]).toMatchObject({ action: "AGENT_UPDATE", entityType: "TASK", source: "CONFIRMED_AGENT" });
    expect(JSON.parse(f.state.audit[0].result as string)).toMatchObject({ escalationScheduleChanged: true });
    expect(result.meta.cancelledEscalationAttemptIds).toEqual(["alarm-attempt", "pending-attempt", "old-attempt"]);
    expect(f.state.attempts.find(row => row.id === "alarm-attempt")?.status).toBe("CANCELLED");
    expect(f.state.attempts.find(row => row.id === "push-attempt")?.status).toBe("CANCELLED");
    expect(f.state.attempts.find(row => row.id === "sent-attempt")?.status).toBe("SENT");
  });

  it.each(["COMPLETE", "DELETE"] as const)("%s cancels without an UPDATE seed marker", async operation => {
    const f = fixture(operation);
    await f.confirm();
    expect(f.state.attempts.find(row => row.id === "alarm-attempt")?.status).toBe("CANCELLED");
    expect(JSON.parse(f.state.audit[0].result as string)).not.toHaveProperty("escalationScheduleChanged");
  });

  it.each(["PENDING", "PROCESSING", "READY_FOR_DEVICE", "SCHEDULED", "CANCELLED", "SENT", "FAILED"])("returns only cancelled or cancellable Android attempts: %s", async status => {
    const f = fixture("COMPLETE");
    f.state.attempts = [{ id: "attempt", userId: "owner", taskId: "target", level: "ANDROID_ALARM", status }];
    const result = await f.confirm();
    const cancelled = !["SENT", "FAILED"].includes(status);
    expect(result.meta.cancelledEscalationAttemptIds).toEqual(cancelled ? ["attempt"] : []);
    expect(f.state.attempts[0].status).toBe(cancelled ? "CANCELLED" : status);
  });

  it("does not add a TASK seed marker to a meeting update", async () => {
    const f = fixture("UPDATE", "MEETING", { time: "13:00" });
    await f.confirm();
    expect(JSON.parse(f.state.audit[0].result as string)).not.toHaveProperty("escalationScheduleChanged");
  });

  it.each(["other owner", "revision", "expired", "CANCELLED", "SUPERSEDED", "questions", "target changed", "foreign target", "claim lost"])("keeps explicit approval and ownership guards: %s", async scenario => {
    const f = fixture("COMPLETE");
    if (scenario === "expired") f.state.draft.expiresAt = now;
    if (["CANCELLED", "SUPERSEDED"].includes(scenario)) f.state.draft.status = scenario;
    if (scenario === "questions") f.state.draft.preview = JSON.stringify({ ...JSON.parse(f.state.draft.preview), questions: ["Clarify"] });
    if (scenario === "target changed") f.state.target.updatedAt = new Date(now.getTime() + 1);
    if (scenario === "foreign target") f.state.target.userId = "other";
    if (scenario === "claim lost") f.tx.agentDraft.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.confirm(scenario === "other owner" ? "other" : "owner", scenario === "revision" ? 2 : 1)).rejects.toThrow();
    expect(f.tx.reminder.updateMany).not.toHaveBeenCalled();
    expect(f.tx.escalationAttempt.updateMany).not.toHaveBeenCalled();
    expect(f.tx.task.update).not.toHaveBeenCalled();
  });

  it("never leaks an executed receipt to another owner or revision", async () => {
    const f = fixture("COMPLETE"); await f.confirm();
    await expect(f.confirm("other")).rejects.toThrow();
    await expect(f.confirm("owner", 2)).rejects.toThrow();
  });

  it("writes cancellation, audit and EXECUTED receipt in one transaction", async () => {
    const f = fixture("COMPLETE");
    f.tx.agentDraft.update.mockRejectedValueOnce(new Error("Synthetic commit failure"));
    await expect(f.confirm()).rejects.toThrow("Synthetic commit failure");
    expect(f.state.draft).toMatchObject({ status: "PENDING", result: null });
    expect(f.state.target.status).toBe("TODO");
    expect(f.state.attempts.find(row => row.id === "alarm-attempt")?.status).toBe("SCHEDULED");
    expect(f.state.audit).toHaveLength(0);
    expect((await f.confirm()).meta.cancelledEscalationAttemptIds).toContain("alarm-attempt");
  });
});
