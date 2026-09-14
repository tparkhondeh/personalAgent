"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function RecoveryForm({ reset = false }: { reset?: boolean }) {
  const [available, setAvailable] = useState<boolean | null>(reset ? true : null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const busy = useRef(false);
  const resetToken = useRef<string | null>(null);
  useEffect(() => {
    if (reset) {
      resetToken.current ??= new URLSearchParams(window.location.hash.slice(1)).get("token");
      window.history.replaceState(null, "", "/reset-password");
      return;
    }
    const controller = new AbortController();
    void fetch("/api/account-recovery", { signal: controller.signal, cache: "no-store" }).then(async response => setAvailable(response.ok && (await response.json()).available === true)).catch(() => { if (!controller.signal.aborted) setAvailable(false); });
    return () => controller.abort();
  }, [reset]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || !available || complete) return;
    const data = new FormData(event.currentTarget);
    busy.current = true; setPending(true); setMessage("");
    try {
      if (reset) {
        const token = resetToken.current;
        if (!token) { setMessage("لینک بازیابی معتبر نیست؛ یک لینک تازه درخواست کن."); return; }
        const password = String(data.get("password"));
        if (password !== String(data.get("confirm"))) { setMessage("دو رمز با هم یکسان نیستند."); return; }
        const result = await authClient.resetPassword({ token, newPassword: password });
        if (result.error) { setMessage("لینک معتبر نیست یا منقضی شده؛ یک لینک تازه درخواست کن."); return; }
        window.history.replaceState(null, "", "/reset-password");
        resetToken.current = null;
        setMessage("رمز تغییر کرد و نشست‌های قبلی بسته شدند. دوباره وارد شو."); setComplete(true);
      } else {
        const result = await authClient.requestPasswordReset({ email: String(data.get("email")), redirectTo: `${window.location.origin}/reset-password` });
        setMessage(result.error ? "درخواست انجام نشد؛ کمی بعد دوباره تلاش کن." : "اگر این ایمیل حساب داشته باشد و ارسال مجاز باشد، لینک بازیابی برایش فرستاده می‌شود.");
      }
    } catch { setMessage("ارتباط برقرار نشد؛ دوباره تلاش کن."); }
    finally { busy.current = false; setPending(false); }
  }
  return <main className="auth-page"><section className="auth-card"><h1>{reset ? "رمز تازه" : "بازیابی حساب"}</h1>
    {!reset && <p>{available === null ? "در حال بررسی…" : available ? "لینک امن به ایمیل همین حساب ارسال می‌شود." : "ارسال ایمیل بازیابی هنوز فعال نشده است. فعلاً از حساب فعلی خارج نشو؛ تنظیم سرویس ایمیل لازم است."}</p>}
    <form onSubmit={submit}>{reset ? <><label>رمز تازه<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required disabled={complete || pending}/></label><label>تکرار رمز<input name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={128} required disabled={complete || pending}/></label></> : <label>ایمیل<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={available !== true || pending}/></label>}
    {message && <p role="status" className="form-error">{message}</p>}
    <button className="submit-button" disabled={!available || pending || complete}>{pending ? "در حال بررسی…" : reset ? "ثبت رمز تازه" : "دریافت لینک بازیابی"}</button></form>
    <Link href="/login">بازگشت به ورود</Link>{reset && <Link href="/forgot-password">درخواست لینک تازه</Link>}</section></main>;
}
