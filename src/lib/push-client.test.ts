import { afterEach, describe, expect, it, vi } from "vitest";
import { enablePushNotifications } from "./push-client";

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
