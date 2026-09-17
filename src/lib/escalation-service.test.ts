import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { escalationAttempt: { findMany: fixture.findMany } } }));
vi.mock("@/lib/push", () => ({ sendWebPush: vi.fn() }));
vi.mock("@/lib/outbound-calls", () => ({ sendUrgentVoiceCall: vi.fn() }));
import { listNativeEscalationAlarms } from "./escalation-service";
beforeEach(() => vi.clearAllMocks());
it("excludes past alarms before the delivery limit so future alarms are not starved", async () => {
  const now = new Date("2026-09-17T12:00:00Z");
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: String(i), taskId: "task", task: { title: "ساختگی" }, attemptNumber: 1, scheduledFor: new Date(now.getTime() + (i - 99) * 60_000) }));
  fixture.findMany.mockImplementation(async ({ where, take }) => rows.filter(row => !where.scheduledFor?.gt || row.scheduledFor > where.scheduledFor.gt).slice(0, take));
  expect((await listNativeEscalationAlarms("owner", now)).map(row => row.id)).toEqual(["100"]);
  expect(fixture.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "owner", scheduledFor: { gt: now } }), take: 100 }));
});
