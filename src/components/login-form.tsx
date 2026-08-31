"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const data = new FormData(event.currentTarget); const email = String(data.get("email")); const password = String(data.get("password"));
    const result = mode === "signup" ? await authClient.signUp.email({ name: String(data.get("name")), email, password }) : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) { setMessage(result.error.message || "ورود انجام نشد"); return; }
    router.push("/"); router.refresh();
  }

  return <main className="auth-page"><section className="auth-card"><Link className="auth-brand" href="/"><span className="brand-mark">ه</span><strong>همراه</strong></Link><div><p className="eyebrow">فضای شخصی و امن تو</p><h1>{mode === "login" ? "خوش برگشتی" : "ساخت حساب جدید"}</h1><p>کارها، جلسات و برنامه روزانه‌ات همیشه همراهت می‌ماند.</p></div><div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>ورود</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>ثبت‌نام</button></div><form onSubmit={submit}>{mode === "signup" && <label>نام<input name="name" required minLength={2} placeholder="نام شما" /></label>}<label>ایمیل<input name="email" type="email" required autoComplete="email" placeholder="name@example.com" dir="ltr" /></label><label>رمز عبور<input name="password" type="password" required minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="حداقل ۱۰ کاراکتر" dir="ltr" /></label>{message && <p className="form-error" role="alert">{message}</p>}<button className="submit-button" disabled={pending}>{pending ? "کمی صبر کن..." : mode === "login" ? "ورود به همراه" : "ساخت حساب"}</button></form><Link className="back-link" href="/">بازگشت به نسخه نمایشی</Link></section></main>;
}
