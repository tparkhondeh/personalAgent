import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
async function personal(url: string, diagnostic = false) {
  vi.stubEnv("TIA_ANDROID_PERSONAL", "true");
  vi.stubEnv("CAPACITOR_SERVER_URL", url);
  vi.stubEnv("TIA_ANDROID_DIAGNOSTIC", diagnostic ? "true" : "false");
  return (await import("../../capacitor.config")).default;
}
test("personal delivery uses permanent TLS and no logging or debugging", async () => {
  const config = await personal("https://personalagent.wealthos.ir:8443");
  expect(config.server?.url).toBe("https://personalagent.wealthos.ir:8443");
  expect(config.server?.cleartext).toBe(false);
  expect(config.android?.allowMixedContent).toBe(false);
  expect(config.android?.webContentsDebuggingEnabled).toBe(false);
  expect(config.loggingBehavior).toBe("none");
  expect(config.server?.errorPath).toBe("connection-error.html");
});
test.each(["", "http://10.0.2.2:3001", "https://personalagent.wealthos.ir", "https://temporary.example", "https://unreachable.invalid"])("rejects an unintended delivery destination: %s", async url => {
  await expect(personal(url)).rejects.toThrow("approved permanent HTTPS");
});
test("diagnostic build is explicit, still non-debuggable and cannot be confused with delivery", async () => {
  const config = await personal("https://unreachable.invalid", true);
  expect(config.android?.webContentsDebuggingEnabled).toBe(false);
  expect(config.loggingBehavior).toBe("none");
});
test("diagnostic flag cannot silently sign the public delivery configuration", async () => {
  await expect(personal("https://personalagent.wealthos.ir:8443", true)).rejects.toThrow();
});
