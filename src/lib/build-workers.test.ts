import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it("bounds only isolated local builds without changing normal CI/runtime config", async () => {
  vi.stubEnv("HAMRAH_ISOLATED_BUILD", "true");
  vi.resetModules();
  const isolated = (await import("../../next.config")).default;
  expect(isolated.experimental?.cpus).toBe(2);
  expect(isolated.distDir).toBe(".next-build");
  vi.stubEnv("HAMRAH_ISOLATED_BUILD", "false");
  vi.resetModules();
  const normal = (await import("../../next.config")).default;
  expect(normal.experimental).toBeUndefined();
  expect(normal.distDir).toBe(".next");
});
