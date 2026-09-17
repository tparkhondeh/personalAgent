import { afterEach, expect, it, vi } from "vitest";
import { startForegroundRefresh } from "./foreground-refresh";
afterEach(() => vi.useRealTimers());
it("refreshes elapsed time/resume, avoids hidden or concurrent work, and cleans up", async () => {
  vi.useFakeTimers();
  const win = Object.assign(new EventTarget(), { setInterval: (fn: () => void, delay: number) => Number(setInterval(fn, delay)), clearInterval: (id: number) => clearInterval(id) });
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  let release!: () => void;
  const refresh = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
  const stop = startForegroundRefresh(refresh, win as unknown as Window, doc);
  await vi.advanceTimersByTimeAsync(60_000); expect(refresh).toHaveBeenCalledOnce();
  win.dispatchEvent(new Event("focus")); expect(refresh).toHaveBeenCalledOnce();
  release(); await Promise.resolve(); await Promise.resolve();
  doc.visibilityState = "hidden"; await vi.advanceTimersByTimeAsync(60_000); expect(refresh).toHaveBeenCalledOnce();
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); expect(refresh).toHaveBeenCalledTimes(2);
  release(); await Promise.resolve(); await Promise.resolve();
  stop(); await vi.advanceTimersByTimeAsync(120_000); win.dispatchEvent(new Event("focus")); expect(refresh).toHaveBeenCalledTimes(2);
});
