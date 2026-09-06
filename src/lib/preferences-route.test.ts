import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedIn: true,
  findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  requireApiSession: async () => mocks.signedIn ? { user: { id: "preferences-qa" } } : null,
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
}));
vi.mock("@/lib/rate-limit", () => ({ guardUserRateLimit: () => null }));
vi.mock("@/lib/db", () => {
  const tx = {
    userPreference: { findUnique: mocks.findUnique, upsert: mocks.upsert },
    escalationAttempt: { updateMany: mocks.updateMany }, auditLog: { create: mocks.audit },
  };
  return { db: { ...tx, $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx) } };
});
import { GET, PUT } from "@/app/api/preferences/route";

const input = {
  timezone: "Asia/Tehran", locale: "fa-IR", workdayStartsAt: "09:00", workdayEndsAt: "18:00",
  workingDays: ["SAT", "SUN"], defaultReminderMins: 60, defaultReminderOffsets: [1440, 180, 60],
  quietHoursStartsAt: "22:00", quietHoursEndsAt: "08:00", urgentEscalationEnabled: true,
  urgentRepeatMinutes: 15, urgentMaxRepeats: 3, androidAlarmEnabled: true, highPriorityEnabled: true,
  smsEscalationEnabled: false, callEscalationEnabled: false, emergencyContactName: null, emergencyPhone: null,
};
const previous = { ...input, id: "legacy-preferences", userId: "preferences-qa", workingDays: "SAT,SUN", defaultReminderOffsets: "1440,180,60", planningProfile: "FOCUS" };
const request = (body?: unknown) => new Request("http://localhost:3001/api/preferences", {
  method: body ? "PUT" : "GET", headers: { "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.signedIn = true;
  mocks.findUnique.mockResolvedValue(previous);
  mocks.upsert.mockImplementation(async ({ update }) => ({ ...previous, ...update }));
});
describe("retired planning style", () => {
  it("omits the legacy setting from GET without deleting its stored value", async () => {
    const response = await GET(request());
    expect((await response.json()).data).not.toHaveProperty("planningProfile");
    expect(previous.planningProfile).toBe("FOCUS");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each([input, { ...input, planningProfile: "FLEXIBLE" }])("saves new and older forms without overwriting history or rescheduling alerts", async (body) => {
    const response = await PUT(request(body));
    expect(response.status).toBe(200);
    const saved = (await response.json()).data;
    expect(saved).not.toHaveProperty("planningProfile");
    expect(saved.defaultReminderOffsets).toEqual([1440, 180, 60]);
    const write = mocks.upsert.mock.calls[0][0];
    expect(write.update).not.toHaveProperty("planningProfile");
    expect(write.create).not.toHaveProperty("planningProfile");
    expect(JSON.parse(mocks.audit.mock.calls[0][0].data.input)).not.toHaveProperty("planningProfile");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("still rejects invalid settings and unauthenticated requests", async () => {
    expect((await PUT(request({ ...input, workingDays: [] }))).status).toBe(422);
    mocks.signedIn = false;
    expect((await PUT(request(input))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
