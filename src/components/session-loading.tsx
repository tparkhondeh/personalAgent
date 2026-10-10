"use client";

import { useEffect, useState } from "react";

export const SESSION_WAIT_MS = 20_000;

/** Remain outside the account/guest boundary while authentication is unresolved. */
export function SessionLoading() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), SESSION_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="session-loading" data-tia-loading="session-v1" dir="rtl">
    <section className="session-loading-message">
      <p role="status">{timedOut ? "بررسی ورود طول کشید. اتصال را بررسی کنید و دوباره تلاش کنید." : "در حال آماده‌سازی tia…"}</p>
      {timedOut && <button type="button" className="primary-button" onClick={() => window.location.reload()}>تلاش دوباره</button>}
    </section>
  </main>;
}
