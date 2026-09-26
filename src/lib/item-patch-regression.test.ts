import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedIn: true, taskFind: vi.fn(), meetingFind: vi.fn(), taskUpdate: vi.fn(), meetingUpdate: vi.fn(),
  preference: vi.fn(), reminderFind: vi.fn(), reminderUpdate: vi.fn(), reminderCreate: vi.fn(),
  escalationUpdate: vi.fn(), escalationFind: vi.fn(), taskDelete: vi.fn(), meetingDelete: vi.fn(), calendar: vi.fn(), audit: vi.fn(), auditFind: vi.fn(), transaction: vi.fn(),
  taskCreate: vi.fn(), meetingCreate: vi.fn(), reminderCount: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  requireApiSession: async () => mocks.signedIn ? { user: { id: "synthetic-owner" } } : null,
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/rate-limit", () => ({ guardUserRateLimit: () => null }));
vi.mock("@/lib/db", () => ({ db: {
  task: { findFirst: mocks.taskFind, update: mocks.taskUpdate },
  meeting: { findFirst: mocks.meetingFind, update: mocks.meetingUpdate },
  userPreference: { findUnique: mocks.preference },
  reminder: { count: mocks.reminderCount },
  $transaction: mocks.transaction,
} }));
import { PATCH as patchTask, DELETE as deleteTask } from "@/app/api/tasks/[id]/route";
import { PATCH as patchMeeting, DELETE as deleteMeeting } from "@/app/api/meetings/[id]/route";
import { POST as createTask } from "@/app/api/tasks/route";
import { POST as createMeeting } from "@/app/api/meetings/route";
import { readAlertPolicy } from "@/lib/alert-policy";

type Item = {
  id: string; userId: string; title: string; status: string; priority: string;
  startAt: Date | null; dueAt: Date | null; startsAt: Date; endsAt: Date;
  alertPolicy: string | null; updatedAt: Date; completedAt: Date | null;
};
type Reminder = {
  id: string; userId: string; taskId?: string; meetingId?: string; scheduledFor: Date;
  channel: string; status: string; idempotencyKey: string; sentAt: Date | null;
};
type Attempt = { id: string; userId: string; taskId: string; level: string; status: string };
type Receipt = { id?: string; input?: string; userId: string; entityId: string; entityType: string; action: string; result?: string };
type Where = { id?: string | { in?: string[]; notIn?: string[] }; userId?: string; taskId?: string; meetingId?: string; status?: string | { in: string[] }; channel?: string | { in: string[] }; level?: string };
const now = new Date("2026-09-20T11:30:00.000Z");
const deadline = new Date("2026-09-20T14:00:00.000Z");
let task: Item, meeting: Item, reminders: Reminder[], attempts: Attempt[], calendar: { title: string; startsAt: Date; endsAt: Date };
let receipts: Receipt[], taskDeleted: boolean, meetingDeleted: boolean;
const params = { params: Promise.resolve({ id: "synthetic-item" }) };
const request = (body: unknown, origin = "http://localhost:3999") => new Request("http://localhost:3999/api/test", {
  method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});
function matches(row: Reminder | Item | Attempt, where: Where) {
  return Object.entries(where).every(([key, value]) => {
    const actual = row[key as keyof typeof row];
    if (value && typeof value === "object") {
      const filter = value as { in?: string[]; notIn?: string[] };
      return (!filter.in || filter.in.includes(String(actual))) && (!filter.notIn || !filter.notIn.includes(String(actual)));
    }
    return actual === value;
  });
}
function seed(kind: "task" | "meeting") {
  reminders = [
    ["sent-day", "2026-09-19T14:00:00.000Z", "SENT"],
    ["sent-three-hours", "2026-09-20T11:00:00.000Z", "SENT"],
    ["pending-hour", "2026-09-20T13:00:00.000Z", "PENDING"],
  ].map(([id, at, status]) => ({ id, userId: "synthetic-owner", [`${kind}Id`]: "synthetic-item", scheduledFor: new Date(at), status, channel: "PUSH", idempotencyKey: id, sentAt: status === "SENT" ? new Date(at) : null }));
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.signedIn = true;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3999");
  const base: Item = { id: "synthetic-item", userId: "synthetic-owner", title: "ساختگی", status: "TODO", priority: "NORMAL", startAt: null, dueAt: deadline, startsAt: deadline, endsAt: new Date("2026-09-20T15:00:00Z"), alertPolicy: null, updatedAt: new Date("2026-09-18T10:00:00Z"), completedAt: null };
  task = structuredClone(base); meeting = { ...structuredClone(base), status: "SCHEDULED" };
  calendar = { title: meeting.title, startsAt: meeting.startsAt, endsAt: meeting.endsAt };
  reminders = [];
  receipts = []; taskDeleted = meetingDeleted = false;
  mocks.taskFind.mockImplementation(async ({ where }) => !taskDeleted && matches(task, where) ? structuredClone(task) : null);
  mocks.meetingFind.mockImplementation(async ({ where }) => !meetingDeleted && matches(meeting, where) ? structuredClone(meeting) : null);
  let version = 0;
  function update(item: Item, data: Partial<Item>) {
    Object.assign(item, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), { updatedAt: new Date(now.getTime() + ++version) });
    return structuredClone(item);
  }
  mocks.taskUpdate.mockImplementation(async ({ data }) => update(task, data));
  mocks.meetingUpdate.mockImplementation(async ({ data }) => update(meeting, data));
  mocks.taskCreate.mockImplementation(async ({ data }) => update(task, data));
  mocks.meetingCreate.mockImplementation(async ({ data }) => update(meeting, data));
  mocks.preference.mockResolvedValue({ defaultReminderMins: 60, defaultReminderOffsets: "1440,180,60" });
  mocks.reminderFind.mockImplementation(async ({ where }) => structuredClone(reminders.filter(row => matches(row, where))));
  mocks.reminderCount.mockImplementation(async ({ where }) => reminders.filter(row => matches(row, where)).length);
  mocks.reminderUpdate.mockImplementation(async ({ where, data }) => {
    const selected = reminders.filter(row => matches(row, where)); selected.forEach(row => Object.assign(row, data)); return { count: selected.length };
  });
  mocks.reminderCreate.mockImplementation(async ({ data }: { data: Reminder[] }) => {
    for (const row of data) {
      if (reminders.some(existing => existing.idempotencyKey === row.idempotencyKey)) throw new Error("Duplicate reminder key");
      reminders.push({ ...row, status: row.status ?? "PENDING", id: `new-${reminders.length}`, sentAt: null });
    }
    return { count: data.length };
  });
  mocks.calendar.mockImplementation(async ({ update }) => { Object.assign(calendar, update); return structuredClone(calendar); });
  attempts = [
    { id: "owned-escalation", userId: "synthetic-owner", taskId: "synthetic-item", level: "ANDROID_ALARM", status: "SCHEDULED" },
    { id: "foreign-escalation", userId: "other-owner", taskId: "synthetic-item", level: "ANDROID_ALARM", status: "SCHEDULED" },
  ];
  mocks.escalationFind.mockImplementation(async ({ where }) => structuredClone(attempts.filter(row => matches(row, where))));
  mocks.escalationUpdate.mockImplementation(async ({ where, data }) => {
    const selected = attempts.filter(row => matches(row, where)); selected.forEach(row => Object.assign(row, data)); return { count: selected.length };
  });
  mocks.audit.mockImplementation(async ({ data }) => { receipts.push(structuredClone(data)); return data; });
  mocks.auditFind.mockImplementation(async ({ where }) => receipts.find(row => Object.entries(where).every(([key, value]) => row[key as keyof Receipt] === value)) ?? null);
  mocks.taskDelete.mockImplementation(async () => { taskDeleted = true; reminders = reminders.filter(row => row.taskId !== task.id || row.userId !== task.userId); return task; });
  mocks.meetingDelete.mockImplementation(async () => { meetingDeleted = true; reminders = reminders.filter(row => row.meetingId !== meeting.id || row.userId !== meeting.userId); return meeting; });
  mocks.transaction.mockImplementation(async callback => callback({
    task: { create: mocks.taskCreate, findFirst: mocks.taskFind, update: mocks.taskUpdate, delete: mocks.taskDelete }, meeting: { create: mocks.meetingCreate, findFirst: mocks.meetingFind, update: mocks.meetingUpdate, delete: mocks.meetingDelete },
    userPreference: { findUnique: mocks.preference }, reminder: { findMany: mocks.reminderFind, updateMany: mocks.reminderUpdate, createMany: mocks.reminderCreate },
    escalationAttempt: { findMany: mocks.escalationFind, updateMany: mocks.escalationUpdate }, calendarEvent: { upsert: mocks.calendar, create: vi.fn() }, auditLog: { create: mocks.audit, findFirst: mocks.auditFind, findUnique: mocks.auditFind },
  }));
});

describe("manual create scheduling and durable custom offsets", () => {
  const post = (body: unknown, key = "synthetic-create-key-0001") => new Request("http://localhost:3999/api/test", { method: "POST", headers: { origin: "http://localhost:3999", "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(body) });
  it.each(["task", "meeting"] as const)("creates only the one future reminder for a two-hour %s; retries do not resurrect completed schedules", async kind => {
    const at = new Date(now.getTime() + 120 * 60000).toISOString();
    const input = kind === "task" ? { title: "ساختگی", category: "PERSONAL", dueAt: at } : { title: "ساختگی", startsAt: at, endsAt: new Date(now.getTime() + 180 * 60000).toISOString() };
    const create = kind === "task" ? createTask : createMeeting;
    for (let i = 0; i < 2; i++) {
      const result = await (await create(post(input))).json();
      expect(result.meta.remindersScheduled).toBe(1);
      expect(reminders).toHaveLength(1);
      expect(reminders[0].scheduledFor.toISOString()).toBe(new Date(now.getTime() + 60 * 60000).toISOString());
    }
    await (kind === "task" ? patchTask : patchMeeting)(request({ status: "DONE" }), params);
    const replay = await (await create(post(input))).json();
    expect(replay.data.status).toBe("DONE"); expect(replay.meta.remindersScheduled).toBe(0);
    expect(reminders.every(row => row.status === "CANCELLED")).toBe(true);
    expect(kind === "task" ? mocks.taskCreate : mocks.meetingCreate).toHaveBeenCalledOnce();
  });
  it.each([0, 30])("persists %s-minute manual offsets across create, due edits and retries without inventing escalation consent", async minutes => {
    const result = await createTask(post({ title: "ساختگی", category: "PERSONAL", dueAt: deadline.toISOString(), reminderMinutes: minutes }));
    expect(result.status).toBe(201); expect(readAlertPolicy(task.alertPolicy)).toBeNull();
    const later = new Date(deadline.getTime() + 86400000);
    await patchTask(request({ dueAt: later.toISOString() }), params);
    await patchTask(request({ dueAt: later.toISOString() }), params);
    expect(reminders.filter(row => row.status === "PENDING").map(row => row.scheduledFor.toISOString())).toEqual([new Date(later.getTime() - minutes * 60000).toISOString()]);
  });
  it("persists a PATCH-only custom offset even when the task currently has no date", async () => {
    task.dueAt = null;
    await patchTask(request({ reminderMinutes: 30 }), params);
    expect(reminders).toHaveLength(0); expect(readAlertPolicy(task.alertPolicy)).toBeNull();
    await patchTask(request({ dueAt: deadline.toISOString() }), params);
    expect(reminders.map(row => row.scheduledFor.toISOString())).toEqual(["2026-09-20T13:30:00.000Z"]);
  });
  it.each(["task", "meeting"] as const)("does not queue past or exactly-now %s reminders", async kind => {
    const input = kind === "task" ? { title: "ساختگی", category: "PERSONAL", dueAt: now.toISOString(), reminderMinutes: 0 } : { title: "ساختگی", startsAt: new Date(now.getTime() + 60 * 60000).toISOString(), endsAt: deadline.toISOString() };
    const result = await (await (kind === "task" ? createTask : createMeeting)(post(input))).json();
    expect(result.meta.remindersScheduled).toBe(0); expect(reminders).toHaveLength(0);
    expect(mocks.reminderCreate).not.toHaveBeenCalled();
  });
});

describe("successful mutations return owned device cancellation IDs without another fetch", () => {
  function seedDevices(kind: "task" | "meeting") {
    seed(kind);
    const base = reminders[2];
    reminders.push(
      { ...base, id: "owned-alarm", idempotencyKey: "owned-alarm", channel: "ALARM", status: "DEVICE_PENDING" },
      { ...base, id: "owned-native", idempotencyKey: "owned-native", channel: "NATIVE", status: "DEVICE_PENDING" },
      { ...base, id: "old-cancelled", idempotencyKey: "old-cancelled", channel: "ALARM", status: "CANCELLED" },
      { ...base, id: "foreign-alarm", idempotencyKey: "foreign-alarm", userId: "other-owner", channel: "ALARM", status: "DEVICE_PENDING" },
    );
  }
  it.each(["task", "meeting"] as const)("returns cancellation metadata on repeated DONE/CANCELLED for %s", async kind => {
    seedDevices(kind); const handler = kind === "task" ? patchTask : patchMeeting;
    for (const status of ["DONE", "DONE", "CANCELLED"]) {
      const response = await handler(request({ status }), params);
      const result = await response.json();
      expect(result.data.status).toBe(status);
      expect(result.meta).toEqual({ cancelledDeviceReminderIds: ["owned-alarm", "owned-native", "old-cancelled"], cancelledEscalationAttemptIds: kind === "task" ? ["owned-escalation"] : [] });
    }
    expect(reminders.find(row => row.id === "foreign-alarm")?.status).toBe("DEVICE_PENDING");
    expect(attempts.find(row => row.id === "foreign-escalation")?.status).toBe("SCHEDULED");
    if (kind === "task") expect(mocks.escalationFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "synthetic-owner", taskId: "synthetic-item" }) }));
  });
  it.each(["task", "meeting"] as const)("replays %s time-change cancellations after a lost response without rescheduling again", async kind => {
    seedDevices(kind);
    (kind === "task" ? task : meeting).alertPolicy = JSON.stringify({ timezone: "UTC", quietStart: "00:00", quietEnd: "00:00", reminderOffsets: [60], channels: ["ALARM", "NATIVE"], escalation: false, repeatCount: 0, repeatMinutes: 15 });
    const handler = kind === "task" ? patchTask : patchMeeting;
    const body = kind === "task" ? { dueAt: "2026-09-20T14:30:00Z" } : { startsAt: "2026-09-20T14:30:00Z" };
    const first = await handler(request(body), params);
    expect(first.status).toBe(200);
    const firstResult = await first.json();
    expect(firstResult.meta).toEqual({ cancelledDeviceReminderIds: ["owned-alarm", "owned-native", "old-cancelled"], cancelledEscalationAttemptIds: kind === "task" ? ["owned-escalation"] : [] });
    const savedReminders = structuredClone(reminders), savedAttempts = structuredClone(attempts);
    const writeCounts = [mocks.reminderUpdate, mocks.reminderCreate, mocks.escalationUpdate].map(mock => mock.mock.calls.length);
    const retry = await handler(request(body), params);
    expect(retry.status).toBe(200);
    expect((await retry.json()).meta).toEqual(firstResult.meta);
    expect(reminders).toEqual(savedReminders); expect(attempts).toEqual(savedAttempts);
    expect([mocks.reminderUpdate, mocks.reminderCreate, mocks.escalationUpdate].map(mock => mock.mock.calls.length)).toEqual(writeCounts);
    expect(reminders.some(row => row.id.startsWith("new-") && row.status === "DEVICE_PENDING")).toBe(true);
    expect(reminders.find(row => row.id === "foreign-alarm")?.status).toBe("DEVICE_PENDING");
    expect(attempts.find(row => row.id === "foreign-escalation")?.status).toBe("SCHEDULED");
  });
  it.each(["task", "meeting"] as const)("returns only historical CANCELLED device IDs for the current owner and %s", async kind => {
    seedDevices(kind);
    const base = reminders.find(row => row.id === "old-cancelled")!;
    reminders.push(
      { ...base, id: "other-item-cancelled", [`${kind}Id`]: "other-item" },
      { ...base, id: "foreign-cancelled", userId: "other-owner" },
      { ...base, id: "push-cancelled", channel: "PUSH" },
    );
    const escalation = { ...attempts[0], status: "CANCELLED" };
    attempts.push(
      { ...escalation, id: "old-escalation" },
      { ...escalation, id: "other-item-escalation", taskId: "other-item" },
      { ...escalation, id: "foreign-cancelled-escalation", userId: "other-owner" },
      { ...escalation, id: "non-device-escalation", level: "PUSH" },
    );
    const savedReminders = structuredClone(reminders), savedAttempts = structuredClone(attempts);
    const response = await (kind === "task" ? patchTask : patchMeeting)(request({ title: "عنوان تازه" }), params);
    expect(response.status).toBe(200);
    expect((await response.json()).meta).toEqual({ cancelledDeviceReminderIds: ["old-cancelled"], cancelledEscalationAttemptIds: kind === "task" ? ["old-escalation"] : [] });
    expect(reminders).toEqual(savedReminders); expect(attempts).toEqual(savedAttempts);
    expect(mocks.reminderUpdate).not.toHaveBeenCalled(); expect(mocks.reminderCreate).not.toHaveBeenCalled(); expect(mocks.escalationUpdate).not.toHaveBeenCalled();
  });
  it("replays task priority-change escalation cancellation after a lost response", async () => {
    const first = await (await patchTask(request({ priority: "URGENT" }), params)).json();
    expect(first.meta.cancelledEscalationAttemptIds).toEqual(["owned-escalation"]);
    const savedAttempts = structuredClone(attempts);
    const retry = await (await patchTask(request({ priority: "URGENT" }), params)).json();
    expect(retry.meta).toEqual(first.meta);
    expect(attempts).toEqual(savedAttempts); expect(mocks.escalationUpdate).toHaveBeenCalledOnce();
    expect(mocks.reminderUpdate).not.toHaveBeenCalled(); expect(mocks.reminderCreate).not.toHaveBeenCalled();
  });
  it.each(["task", "meeting"] as const)("captures %s device IDs before cascade deletion", async kind => {
    seedDevices(kind); const handler = kind === "task" ? deleteTask : deleteMeeting;
    const response = await handler(request({}), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: "synthetic-item", deleted: true }, meta: { cancelledDeviceReminderIds: ["owned-alarm", "owned-native", "old-cancelled"], cancelledEscalationAttemptIds: kind === "task" ? ["owned-escalation"] : [] } });
    expect(reminders.map(row => row.id)).toEqual(["foreign-alarm"]);
  });
  it.each(["task", "meeting"] as const)("replays an owned %s deletion receipt after the first response is lost", async kind => {
    seedDevices(kind); const handler = kind === "task" ? deleteTask : deleteMeeting;
    const first = await (await handler(request({}), params)).json();
    const retry = await handler(request({}), params);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(first);
    expect(kind === "task" ? mocks.taskDelete : mocks.meetingDelete).toHaveBeenCalledOnce();
    expect(receipts.filter(row => row.action.endsWith("_DELETED"))).toHaveLength(1);
    expect(JSON.parse(receipts[0].result!)).toEqual(first.meta);
  });
  it.each(["task", "meeting"] as const)("never replays another owner's %s deletion receipt", async kind => {
    taskDeleted = meetingDeleted = true;
    receipts.push({ userId: "other-owner", entityId: "synthetic-item", entityType: kind === "task" ? "Task" : "Meeting", action: `${kind.toUpperCase()}_DELETED`, result: JSON.stringify({ cancelledDeviceReminderIds: ["foreign-device"], cancelledEscalationAttemptIds: [] }) });
    const response = await (kind === "task" ? deleteTask : deleteMeeting)(request({}), params);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("foreign-device");
    expect(mocks.taskDelete).not.toHaveBeenCalled(); expect(mocks.meetingDelete).not.toHaveBeenCalled();
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("task escalation schedule audit marker", () => {
  it.each([
    [{ dueAt: "2026-09-20T14:30:00Z" }, true],
    [{ dueAt: null }, true],
    [{ priority: "URGENT" }, true],
    [{ status: "DONE" }, true],
    [{ title: "عنوان تازه" }, false],
    [{ reminderMinutes: 30 }, false],
    [{ status: "IN_PROGRESS" }, false],
    [{ status: "TODO" }, false],
    [{ priority: "NORMAL" }, false],
    [{ dueAt: deadline.toISOString() }, false],
  ] as const)("marks only meaningful changes for %j", async (body, changed) => {
    expect((await patchTask(request(body), params)).status).toBe(200);
    expect(receipts[0].action).toBe("TASK_UPDATED");
    expect(receipts[0].result === undefined ? undefined : JSON.parse(receipts[0].result)).toEqual(changed ? { escalationScheduleChanged: true } : undefined);
    expect((await patchTask(request(body), params)).status).toBe(200);
    expect(receipts[1].result).toBeUndefined();
  });
});

describe("PATCH preserves delivered and pending reminders", () => {
  it.each([{ title: "عنوان تازه" }, { priority: "URGENT" }, { endsAt: "2026-09-20T16:00:00Z" }, { startsAt: deadline.toISOString() }, { status: "SCHEDULED" }])("does not rearm a meeting for %j", async body => {
    seed("meeting"); const before = structuredClone(reminders);
    expect((await patchMeeting(request(body), params)).status).toBe(200);
    expect(reminders).toEqual(before);
  });
  it.each([{ status: "IN_PROGRESS" }, { status: "TODO" }, { dueAt: deadline.toISOString() }, { title: "عنوان تازه" }])("does not rearm an active task for %j", async body => {
    seed("task"); const before = structuredClone(reminders);
    expect((await patchTask(request(body), params)).status).toBe(200);
    expect(reminders).toEqual(before);
  });
  it.each(["task", "meeting"] as const)("reschedules only future slots and retains history for %s", async kind => {
    seed(kind); const history = structuredClone(reminders.filter(row => row.status === "SENT"));
    const handler = kind === "task" ? patchTask : patchMeeting;
    const body = kind === "task" ? { dueAt: "2026-09-20T14:30:00Z" } : { startsAt: "2026-09-20T14:30:00Z" };
    expect((await handler(request(body), params)).status).toBe(200);
    expect(reminders.filter(row => row.status === "SENT")).toEqual(history);
    expect(reminders.filter(row => row.status === "PENDING").map(row => row.scheduledFor.toISOString())).toEqual(["2026-09-20T13:30:00.000Z"]);
    const saved = structuredClone(reminders);
    expect((await handler(request(body), params)).status).toBe(200);
    expect(reminders).toEqual(saved);
  });
  it.each(["task", "meeting"] as const)("cancels future reminders once on completion/cancellation of %s", async kind => {
    seed(kind); const handler = kind === "task" ? patchTask : patchMeeting;
    for (const status of ["DONE", "DONE", "CANCELLED"]) expect((await handler(request({ status }), params)).status).toBe(200);
    expect(reminders.map(row => row.status)).toEqual(["SENT", "SENT", "CANCELLED"]);
    expect(mocks.reminderCreate).not.toHaveBeenCalled();
  });
  it.each(["task", "meeting"] as const)("keeps a matching pending slot during a real %s reschedule", async kind => {
    seed(kind); const before = structuredClone(reminders[2]);
    const handler = kind === "task" ? patchTask : patchMeeting;
    const body = kind === "task" ? { dueAt: "2026-09-20T16:00:00Z" } : { startsAt: "2026-09-20T16:00:00Z", endsAt: "2026-09-20T17:00:00Z" };
    const result = await (await handler(request(body), params)).json();
    expect(result.meta.cancelledDeviceReminderIds).toEqual([]);
    expect(reminders.find(row => row.id === before.id)).toEqual(before);
    expect(reminders.filter(row => row.status === "PENDING").map(row => row.scheduledFor.toISOString())).toEqual(["2026-09-20T13:00:00.000Z", "2026-09-20T15:00:00.000Z"]);
  });
  it.each(["SENT", "PARTIAL", "FAILED", "PROCESSING"])("does not replay a matching %s slot on explicit reminder retry", async status => {
    seed("task"); reminders[2].status = status;
    const before = structuredClone(reminders);
    for (let retry = 0; retry < 2; retry++) expect((await patchTask(request({ reminderMinutes: 60 }), params)).status).toBe(200);
    expect(reminders).toEqual(before);
    expect(mocks.reminderCreate).not.toHaveBeenCalled();
  });
  it.each(["task", "meeting"] as const)("never rearms a completed/cancelled %s on title or time edits", async kind => {
    seed(kind); const handler = kind === "task" ? patchTask : patchMeeting;
    for (const status of ["DONE", "CANCELLED"]) {
      await handler(request({ status }), params);
      await handler(request(kind === "task" ? { title: "تازه", dueAt: "2026-09-21T14:00:00Z" } : { title: "تازه", startsAt: "2026-09-21T14:00:00Z", endsAt: "2026-09-21T15:00:00Z" }), params);
      expect((kind === "task" ? task : meeting).status).toBe(status);
      expect(reminders.some(row => ["PENDING", "DEVICE_PENDING", "PROCESSING"].includes(row.status))).toBe(false);
    }
    expect(mocks.reminderCreate).not.toHaveBeenCalled();
  });
  it("retains completion time on rapid repeated DONE", async () => {
    await patchTask(request({ status: "DONE" }), params);
    const completedAt = task.completedAt;
    vi.setSystemTime(new Date(now.getTime() + 5000));
    await patchTask(request({ status: "DONE" }), params);
    expect(task.completedAt).toEqual(completedAt);
  });
  it("cancels task reminders when its deadline is removed", async () => {
    seed("task");
    expect((await patchTask(request({ dueAt: null }), params)).status).toBe(200);
    expect(task.dueAt).toBeNull();
    expect(reminders.map(row => row.status)).toEqual(["SENT", "SENT", "CANCELLED"]);
  });
  it.each(["task", "meeting"] as const)("honors stored device channels and returns obsolete %s alarm IDs", async kind => {
    const policy = JSON.stringify({ timezone: "UTC", quietStart: "00:00", quietEnd: "00:00", reminderOffsets: [60], channels: ["ALARM", "NATIVE"], escalation: false, repeatCount: 0, repeatMinutes: 15 });
    (kind === "task" ? task : meeting).alertPolicy = policy;
    seed(kind); reminders[2].channel = "ALARM"; reminders[2].status = "DEVICE_PENDING";
    const handler = kind === "task" ? patchTask : patchMeeting;
    const result = await (await handler(request(kind === "task" ? { dueAt: "2026-09-20T14:30:00Z" } : { startsAt: "2026-09-20T14:30:00Z" }), params)).json();
    expect(result.meta.cancelledDeviceReminderIds).toEqual(["pending-hour"]);
    expect(reminders.filter(row => row.status === "DEVICE_PENDING")).toMatchObject([{ channel: "ALARM", scheduledFor: new Date("2026-09-20T13:30:00Z") }]);
    expect((kind === "task" ? task : meeting).alertPolicy).toBe(policy);
  });
});

describe("PATCH reads the current owned record in its transaction", () => {
  it("preserves a concurrent meeting time edit when saving only a title", async () => {
    seed("meeting"); const delayed = request({ title: "عنوان تازه" });
    vi.spyOn(delayed, "json").mockImplementation(async () => {
      expect((await patchMeeting(request({ startsAt: "2026-09-21T14:00:00Z", endsAt: "2026-09-21T15:00:00Z" }), params)).status).toBe(200);
      return { title: "عنوان تازه" };
    });
    expect((await patchMeeting(delayed, params)).status).toBe(200);
    expect(meeting.startsAt.toISOString()).toBe("2026-09-21T14:00:00.000Z");
    expect(calendar.startsAt).toEqual(meeting.startsAt); expect(calendar.endsAt).toEqual(meeting.endsAt);
  });
  it("validates a partial time edit against the latest end time", async () => {
    const delayed = request({ startsAt: "2026-09-20T17:00:00Z" });
    vi.spyOn(delayed, "json").mockImplementation(async () => {
      expect((await patchMeeting(request({ endsAt: "2026-09-20T18:00:00Z" }), params)).status).toBe(200);
      return { startsAt: "2026-09-20T17:00:00Z" };
    });
    expect((await patchMeeting(delayed, params)).status).toBe(200);
    expect(meeting.endsAt.toISOString()).toBe("2026-09-20T18:00:00.000Z");
  });
  it.each(["task", "meeting"] as const)("rejects another owner's %s and untrusted origins", async kind => {
    task.userId = meeting.userId = "other-owner";
    const handler = kind === "task" ? patchTask : patchMeeting;
    expect((await handler(request({ title: "wrong" }), params)).status).toBe(404);
    expect((await handler(request({ title: "wrong" }, "https://foreign.invalid"), params)).status).toBe(403);
    expect(mocks.taskUpdate).not.toHaveBeenCalled(); expect(mocks.meetingUpdate).not.toHaveBeenCalled();
  });
  it("rejects a now-invalid partial meeting end without overwriting the newer start", async () => {
    const delayed = request({ endsAt: "2026-09-20T16:00:00Z" });
    vi.spyOn(delayed, "json").mockImplementation(async () => {
      await patchMeeting(request({ startsAt: "2026-09-20T17:00:00Z", endsAt: "2026-09-20T18:00:00Z" }), params);
      return { endsAt: "2026-09-20T16:00:00Z" };
    });
    expect((await patchMeeting(delayed, params)).status).toBe(422);
    expect(meeting.startsAt.toISOString()).toBe("2026-09-20T17:00:00.000Z");
    expect(calendar.endsAt.toISOString()).toBe("2026-09-20T18:00:00.000Z");
  });
  it.each(["task", "meeting"] as const)("does not undo concurrent %s completion during a title save", async kind => {
    seed(kind); const handler = kind === "task" ? patchTask : patchMeeting;
    const delayed = request({ title: "تازه" });
    vi.spyOn(delayed, "json").mockImplementation(async () => {
      await handler(request({ status: "DONE" }), params); return { title: "تازه" };
    });
    const result = await (await handler(delayed, params)).json();
    expect(result.data.status).toBe("DONE");
    expect(reminders.map(row => row.status)).toEqual(["SENT", "SENT", "CANCELLED"]);
  });
  it("preserves a concurrently changed task alert policy when overriding its reminder", async () => {
    const oldPolicy = { timezone: "UTC", quietStart: "00:00", quietEnd: "00:00", reminderOffsets: [60], channels: ["PUSH"], escalation: false, repeatCount: 0, repeatMinutes: 15 };
    task.alertPolicy = JSON.stringify(oldPolicy);
    const delayed = request({ reminderMinutes: 30 });
    vi.spyOn(delayed, "json").mockImplementation(async () => {
      // Simulate another committed transaction while this request body is being read.
      task.alertPolicy = JSON.stringify({ ...oldPolicy, channels: ["ALARM"], repeatMinutes: 30 });
      return { reminderMinutes: 30 };
    });
    expect((await patchTask(delayed, params)).status).toBe(200);
    expect(JSON.parse(task.alertPolicy!)).toMatchObject({ channels: ["ALARM"], repeatMinutes: 30, reminderOffsets: [30] });
    expect(reminders).toMatchObject([{ channel: "ALARM", status: "DEVICE_PENDING" }]);
  });
  it.each(["task", "meeting"] as const)("does not delete another owner's %s", async kind => {
    task.userId = meeting.userId = "other-owner";
    const response = await (kind === "task" ? deleteTask : deleteMeeting)(request({}), params);
    expect(response.status).toBe(404);
    expect(mocks.taskDelete).not.toHaveBeenCalled(); expect(mocks.meetingDelete).not.toHaveBeenCalled();
    expect(mocks.reminderFind).not.toHaveBeenCalled(); expect(mocks.escalationFind).not.toHaveBeenCalled();
  });
});
