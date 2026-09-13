import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  native: vi.fn(), platform: vi.fn(), available: vi.fn(), check: vi.fn(), request: vi.fn(), exact: vi.fn(), push: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: fake.native, getPlatform: fake.platform, isPluginAvailable: fake.available } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { checkPermissions: fake.check, requestPermissions: fake.request, checkExactNotificationSetting: fake.exact } }));
vi.mock("@/lib/push-client", () => ({ enablePushNotifications: fake.push }));
import { enableNotificationsForDevice } from "./notification-access";

beforeEach(() => {
  vi.resetAllMocks();
  fake.native.mockReturnValue(true);
  fake.platform.mockReturnValue("android");
  fake.available.mockReturnValue(true);
  fake.check.mockResolvedValue({ display: "granted" });
  fake.request.mockResolvedValue({ display: "granted" });
  fake.exact.mockResolvedValue({ exact_alarm: "granted" });
  // Reproduce Android WebView with no browser Push/Notification globals.
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", {});
});
afterEach(() => vi.unstubAllGlobals());

describe("notification center routes to the actual device", () => {
  it("uses Android permission without browser Push, a new schedule or test delivery", async () => {
    const result = await enableNotificationsForDevice();
    expect(result).toMatchObject({ mode: "native", enabled: true });
    expect(result.message).toContain("دریافت یادآوری هنوز باید آزمایش شود");
    expect(fake.available).toHaveBeenCalledWith("LocalNotifications");
    expect(fake.push).not.toHaveBeenCalled();
    expect(fake.request).not.toHaveBeenCalled();
  });
  it("asks for display permission when needed", async () => {
    fake.check.mockResolvedValue({ display: "prompt" });
    expect((await enableNotificationsForDevice()).enabled).toBe(true);
    expect(fake.request).toHaveBeenCalledOnce();
    expect(fake.push).not.toHaveBeenCalled();
  });
  it("does not claim success or check Alarm after permission is declined", async () => {
    fake.check.mockResolvedValue({ display: "prompt" });
    fake.request.mockResolvedValue({ display: "denied" });
    const result = await enableNotificationsForDevice();
    expect(result.enabled).toBe(false);
    expect(result.message).toContain("اجازه Notification داده نشد");
    expect(fake.exact).not.toHaveBeenCalled();
    expect(fake.push).not.toHaveBeenCalled();
  });
  it("keeps Notification available without claiming exact Alarm permission", async () => {
    fake.exact.mockResolvedValue({ exact_alarm: "denied" });
    const result = await enableNotificationsForDevice();
    expect(result.enabled).toBe(true);
    expect(result.message).toContain("برای زمان دقیق Alarm");
    expect(fake.push).not.toHaveBeenCalled();
  });
  it("reports unknown Alarm readiness without revoking granted Notification", async () => {
    fake.exact.mockRejectedValue(new Error("native detail"));
    const result = await enableNotificationsForDevice();
    expect(result.enabled).toBe(true);
    expect(result.message).toContain("وضعیت مجوز Alarm مشخص نشد");
    expect(result.message).not.toContain("native detail");
  });
  it.each(["check", "request"] as const)("sanitizes %s failure without falling back to browser Push", async method => {
    fake.check.mockResolvedValue({ display: "prompt" });
    fake[method].mockRejectedValue(new Error("private implementation detail"));
    const result = await enableNotificationsForDevice();
    expect(result.enabled).toBe(false);
    expect(result.message).not.toContain("private");
    expect(fake.push).not.toHaveBeenCalled();
  });
  it("fails clearly if the native plugin is missing, instead of using Web Push", async () => {
    fake.available.mockReturnValue(false);
    expect((await enableNotificationsForDevice()).enabled).toBe(false);
    expect(fake.check).not.toHaveBeenCalled();
    expect(fake.push).not.toHaveBeenCalled();
  });
  it("does not misidentify another native platform as a browser", async () => {
    fake.platform.mockReturnValue("ios");
    expect((await enableNotificationsForDevice()).enabled).toBe(false);
    expect(fake.push).not.toHaveBeenCalled();
  });
  it.each(["push", "local"])("preserves the browser %s route with honest status", async mode => {
    fake.native.mockReturnValue(false);
    fake.push.mockResolvedValue({ mode });
    const result = await enableNotificationsForDevice();
    expect(result).toMatchObject({ mode, enabled: true });
    expect(result.message).toContain(mode === "push" ? "هنوز" : "Push سرور هنوز فعال نیست");
    expect(fake.check).not.toHaveBeenCalled();
    expect(fake.push).toHaveBeenCalledOnce();
  });
  it("keeps browser failures actionable without requesting native permissions", async () => {
    fake.native.mockReturnValue(false);
    fake.push.mockRejectedValue(new Error("browser permission denied"));
    await expect(enableNotificationsForDevice()).rejects.toThrow("browser permission denied");
    expect(fake.request).not.toHaveBeenCalled();
  });
});
