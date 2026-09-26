import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: "account-a" as string | null, upsert: vi.fn(), remove: vi.fn(), logout: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireApiSession: async () => mocks.owner ? { user: { id: mocks.owner } } : null, jsonError: (error: string, status: number) => Response.json({ error }, { status }) }));
vi.mock("@/lib/db", () => ({ db: { pushSubscription: { upsert: mocks.upsert, deleteMany: mocks.remove } } }));
vi.mock("@/lib/rate-limit", () => ({ guardUserRateLimit: () => null }));
vi.mock("@/lib/push-config", () => ({ publicWebPushConfig: () => ({ publicKey: null }) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ GET: vi.fn(), POST: mocks.logout }) }));
import { GET, POST, DELETE } from "@/app/api/push-subscriptions/route";
import { POST as logout } from "@/app/api/auth/[...all]/route";
type Subscription = { userId: string; endpoint: string; p256dh: string; auth: string };
let rows: Subscription[];
const device = (suffix = "one", userId = "account-a") => ({ userId, endpoint: `https://fcm.googleapis.com/fcm/send/synthetic-${suffix}`, keys: { p256dh: "synthetic-public", auth: "synthetic-auth" } });
const request = (method: string, body?: unknown, path = "push-subscriptions", headers = {}) => new Request(`http://localhost:3999/api/${path}`, { method, headers: { origin: "http://localhost:3999", "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.owner = "account-a"; rows = [];
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3999");
  mocks.upsert.mockImplementation(async ({ where, create, update }) => {
    const row = rows.find(row => row.endpoint === where.endpoint);
    if (row && row.userId !== where.userId) throw { code: "P2002" };
    if (row) Object.assign(row, update); else rows.push({ ...create });
  });
  mocks.remove.mockImplementation(async ({ where }) => {
    const matching = rows.filter(row => Object.entries(where).every(([key, value]) => row[key as keyof Subscription] === value));
    rows = rows.filter(row => !matching.includes(row)); return { count: matching.length };
  });
  mocks.session.mockImplementation(async () => mocks.owner ? { user: { id: mocks.owner } } : null);
  mocks.logout.mockImplementation(async () => { mocks.owner = null; return Response.json({ success: true }); });
});
afterEach(() => vi.unstubAllEnvs());

describe("exact browser binding and account-safe logout", () => {
  it("publishes only authenticated account binding and public config, without caching", async () => {
    const response = await GET(request("GET"));
    expect(await response.json()).toEqual({ publicKey: null, userId: "account-a" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    mocks.owner = null; expect((await GET(request("GET"))).status).toBe(401);
  });
  it("cannot transfer another account's endpoint; exact-device deletion and retry leave other devices intact", async () => {
    expect((await POST(request("POST", device()))).status).toBe(201);
    await POST(request("POST", device("two")));
    mocks.owner = "account-b";
    expect((await POST(request("POST", device("one", "account-b")))).status).toBe(409);
    expect((await DELETE(request("DELETE", device()))).status).toBe(409);
    expect(await (await DELETE(request("DELETE", device("one", "account-b")))).json()).toEqual({ ok: true, revoked: false });
    expect(rows).toHaveLength(2);
    mocks.owner = "account-a";
    expect(await (await DELETE(request("DELETE", { ...device(), keys: { p256dh: "wrong", auth: "wrong" } }))).json()).toMatchObject({ revoked: false });
    expect(await (await DELETE(request("DELETE", device()))).json()).toMatchObject({ revoked: true });
    expect(await (await DELETE(request("DELETE", device()))).json()).toMatchObject({ revoked: false });
    expect(rows).toEqual([expect.objectContaining({ endpoint: device("two").endpoint, userId: "account-a" })]);
  });
  it.each([POST, DELETE])("rejects stale-account requests before any DB mutation", async handler => {
    mocks.owner = "account-b";
    expect((await handler(request("POST", device()))).status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("redacts cleanup failure and does not claim deletion", async () => {
    mocks.remove.mockRejectedValue(new Error("private endpoint/key details"));
    const response = await DELETE(request("DELETE", device()));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
  it("blocks late logout of another account; permits owned and already-expired logout", async () => {
    mocks.owner = "account-b";
    expect((await logout(request("POST", {}, "auth/sign-out", { "x-tia-user-id": "account-a" }))).status).toBe(409);
    expect(mocks.logout).not.toHaveBeenCalled(); expect(mocks.owner).toBe("account-b");
    expect((await logout(request("POST", {}, "auth/sign-out", { "x-tia-user-id": "account-b" }))).status).toBe(200);
    expect((await logout(request("POST", {}, "auth/sign-out", { "x-tia-user-id": "account-b" }))).status).toBe(200);
  });
  it("fails closed if session verification fails, and checks origin before auth", async () => {
    expect((await logout(request("POST", {}, "auth/sign-out", { "x-tia-user-id": "account-a", origin: "https://untrusted.example" }))).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    mocks.session.mockRejectedValue(Error("synthetic unavailable"));
    await expect(logout(request("POST", {}, "auth/sign-out", { "x-tia-user-id": "account-a" }))).rejects.toThrow();
    expect(mocks.logout).not.toHaveBeenCalled();
  });
});
