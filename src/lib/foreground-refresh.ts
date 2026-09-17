// Foreground polling is not a promise of Android background execution.
export function startForegroundRefresh(refresh: () => Promise<void>, win: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">, doc: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">) {
  let active = true, busy = false;
  const run = () => {
    if (!active || busy || doc.visibilityState !== "visible") return;
    busy = true;
    void refresh().catch(() => {}).finally(() => { busy = false; });
  };
  const timer = win.setInterval(run, 60_000);
  win.addEventListener("focus", run); doc.addEventListener("visibilitychange", run);
  return () => { active = false; win.clearInterval(timer); win.removeEventListener("focus", run); doc.removeEventListener("visibilitychange", run); };
}
