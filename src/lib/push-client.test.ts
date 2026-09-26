import { afterEach, describe, expect, it, vi } from "vitest";
import { enablePushNotifications, logoutWithPushCleanup } from "./push-client";

afterEach(() => vi.unstubAllGlobals());
describe("Web Push capability errors stay separate from native notifications", () => {
  it.each(["serviceWorker", "PushManager", "Notification"])("rejects missing %s before requesting permission or registering a worker", async missing => {
    const register = vi.fn();
    const requestPermission = vi.fn();
    vi.stubGlobal("navigator", missing === "serviceWorker" ? {} : { serviceWorker: { register } });
    vi.stubGlobal("window", {
      ...(missing !== "PushManager" ? { PushManager: {} } : {}),
      ...(missing !== "Notification" ? { Notification: { requestPermission } } : {}),
    });
    await expect(enablePushNotifications()).rejects.toThrow("این مرورگر از Push پشتیبانی نمی‌کند");
    expect(register).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

function browser() {
  let queue: Promise<unknown> = Promise.resolve();
  const subscription = { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", keys: { p256dh: "synthetic-public", auth: "synthetic-auth" } }), unsubscribe: vi.fn(async () => true) };
  const close = vi.fn();
  const registration = { pushManager: { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn(async () => subscription) }, getNotifications: vi.fn(async () => [{ close }]), showNotification: vi.fn() };
  const register = vi.fn(async () => registration);
  vi.stubGlobal("navigator", { serviceWorker: { register, getRegistration: vi.fn(async () => registration) }, locks: { request: (_: string, action: () => Promise<unknown>) => { const result = queue.then(action); queue = result.catch(() => undefined); return result; } } });
  vi.stubGlobal("window", { PushManager: {}, Notification: {}, atob });
  vi.stubGlobal("Notification", { requestPermission: vi.fn(async () => "granted") });
  const fetch = vi.fn(async (_: unknown, init?: RequestInit) => Response.json(init?.method === "DELETE" ? { ok: true, revoked: true } : init?.method === "POST" ? { ok: true } : { publicKey: "c3ludGhldGlj", userId: "account-a" }));
  vi.stubGlobal("fetch", fetch);
  const signOut = vi.fn(async () => ({}));
  return { subscription, registration, register, fetch, signOut, close };
}

describe("browser logout revocation and race/failure safety", () => {
  it("deletes exactly the current device before unsubscribing and binding logout to its account", async () => {
    const b = browser(); await logoutWithPushCleanup("account-a", b.signOut);
    const init = b.fetch.mock.calls[0][1]!;
    expect(init.method).toBe("DELETE"); expect(JSON.parse(String(init.body))).toEqual({ ...b.subscription.toJSON(), userId: "account-a" });
    expect(b.subscription.unsubscribe).toHaveBeenCalledOnce(); expect(b.close).toHaveBeenCalledOnce();
    expect(b.signOut).toHaveBeenCalledWith({ fetchOptions: { headers: { "x-tia-user-id": "account-a" } } });
    expect(b.register).not.toHaveBeenCalled();
  });
  it.each([409, 503])("never unsubscribes an unverified binding on cleanup HTTP %s, but still attempts guarded logout", async status => {
    const b = browser(); b.fetch.mockResolvedValue(new Response("{}", { status }));
    const result = await logoutWithPushCleanup("account-a", b.signOut);
    expect(b.subscription.unsubscribe).not.toHaveBeenCalled(); expect(b.signOut).toHaveBeenCalledOnce(); expect(result.pushRevoked).toBe(false);
    expect(b.close).toHaveBeenCalledOnce();
  });
  it("does not unsubscribe a foreign binding or replay cleanup after an idempotent delete", async () => {
    const b = browser(); b.fetch.mockResolvedValue(Response.json({ ok: true, revoked: false }));
    await logoutWithPushCleanup("account-a", b.signOut); expect(b.subscription.unsubscribe).not.toHaveBeenCalled();
  });
  it("surfaces auth failure after cleanup, and never restores or retries a revoked subscription", async () => {
    const b = browser(); const failed = vi.fn(async () => ({ error: { status: 503 } }));
    await expect(logoutWithPushCleanup("account-a", failed)).rejects.toThrow("خروج تأیید نشد");
    expect(b.subscription.unsubscribe).toHaveBeenCalledOnce(); expect(b.registration.pushManager.subscribe).not.toHaveBeenCalled(); expect(failed).toHaveBeenCalledOnce();
  });
  it("does not let a provider revocation failure trap the user after server revocation", async () => {
    const b = browser(); b.subscription.unsubscribe.mockRejectedValue(Error("synthetic provider failure"));
    expect(await logoutWithPushCleanup("account-a", b.signOut)).toEqual({ pushRevoked: true }); expect(b.signOut).toHaveBeenCalledOnce();
  });
  it("native logout never probes browser subscriptions", async () => {
    const b = browser(); await logoutWithPushCleanup("account-a", b.signOut, true); expect(b.fetch).not.toHaveBeenCalled(); expect(b.registration.pushManager.getSubscription).not.toHaveBeenCalled();
  });
  it("rejects account changes between the displayed account and config before rotation", async () => {
    const b = browser(); await expect(enablePushNotifications("account-b")).rejects.toThrow("حساب تغییر کرده");
    expect(b.subscription.unsubscribe).not.toHaveBeenCalled(); expect(b.registration.pushManager.subscribe).not.toHaveBeenCalled();
  });
  it("serializes a pending enable POST before logout cleanup, across the device lock", async () => {
    const b = browser(); let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    b.fetch.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") { await pending; return Response.json({ ok: true }); }
      return Response.json(init?.method === "DELETE" ? { ok: true, revoked: true } : { publicKey: "c3ludGhldGlj", userId: "account-a" });
    });
    const enabling = enablePushNotifications("account-a");
    await vi.waitFor(() => expect(b.fetch.mock.calls.some(call => call[1]?.method === "POST")).toBe(true));
    const loggingOut = logoutWithPushCleanup("account-a", b.signOut);
    await Promise.resolve(); expect(b.signOut).not.toHaveBeenCalled();
    release(); await enabling; await loggingOut;
    expect(b.fetch.mock.calls.map(call => call[1]?.method ?? "GET")).toEqual(["GET", "DELETE", "POST", "DELETE"]);
    expect(b.signOut).toHaveBeenCalledOnce();
  });
  it("uncertain registration is not retried or reused", async () => {
    const b = browser();
    b.fetch.mockImplementation(async (_url, init) => { if (init?.method === "POST") throw Error("synthetic network failure"); return Response.json(init?.method === "DELETE" ? { ok: true, revoked: true } : { publicKey: "c3ludGhldGlj", userId: "account-a" }); });
    await expect(enablePushNotifications("account-a")).rejects.toThrow("synthetic network failure");
    expect(b.fetch.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    expect(b.subscription.unsubscribe).toHaveBeenCalledTimes(2);
  });
  it("an unanswered permission prompt does not block logout or bind the previous account later", async () => {
    const b = browser(); let grant!: (value: string) => void;
    vi.stubGlobal("Notification", { requestPermission: () => new Promise<string>(resolve => { grant = resolve; }) });
    const enabling = enablePushNotifications("account-a");
    await logoutWithPushCleanup("account-a", b.signOut); expect(b.signOut).toHaveBeenCalledOnce();
    b.fetch.mockResolvedValue(Response.json({ publicKey: "c3ludGhldGlj", userId: "account-b" }));
    grant("granted"); await expect(enabling).rejects.toThrow("حساب تغییر کرده");
    expect(b.registration.pushManager.subscribe).not.toHaveBeenCalled();
  });
});
