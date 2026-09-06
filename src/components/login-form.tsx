"use client";
import { TiaMark } from "@/components/tia-mark";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const data = new FormData(event.currentTarget); const email = String(data.get("email")); const password = String(data.get("password"));
    let result;
    // The installed server accepts rememberMe for signup; its client input type omits that optional field.
    const signup = { name: String(data.get("name")), email, password, rememberMe };
    try { result = mode === "signup" ? await authClient.signUp.email(signup) : await authClient.signIn.email({ email, password, rememberMe }); }
    catch { setPending(false); setMessage("ارتباط برقرار نشد؛ دوباره تلاش کن."); return; }
    setPending(false);
    if (result.error) { setMessage(result.error.message || "ورود انجام نشد"); return; }
    router.push(new URLSearchParams(window.location.search).get("returnTo") === "assistant" ? "/?view=assistant" : "/"); router.refresh();
  }

  return <main className="auth-page"><section className="auth-card"><Link className="auth-brand" href="/"><TiaMark/><strong dir="ltr">tia</strong></Link><div><p className="eyebrow">فضای شخصی و امن تو</p><h1>{mode === "login" ? "خوش برگشتی" : "ساخت حساب جدید"}</h1><p>کارها، جلسات و برنامه روزانه‌ات همیشه همراهت می‌ماند.</p></div><div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>ورود</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>ثبت‌نام</button></div><form onSubmit={submit}>{mode === "signup" && <label>نام<input name="name" required minLength={2} placeholder="نام شما" /></label>}<label>ایمیل<input name="email" type="email" required autoComplete="email" placeholder="name@example.com" dir="ltr" /></label><label>رمز عبور<input name="password" type="password" required minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="حداقل ۱۰ کاراکتر" dir="ltr" /></label><label className="remember-session"><input type="checkbox" name="rememberMe" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} />مرا به خاطر بسپار</label>{message && <p className="form-error" role="alert">{message}</p>}<button className="submit-button" disabled={pending}>{pending ? "کمی صبر کن..." : mode === "login" ? "ورود به tia" : "ساخت حساب"}</button></form><Link className="back-link" href="/">بازگشت به نسخه نمایشی</Link></section></main>;
}
