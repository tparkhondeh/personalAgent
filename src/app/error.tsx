"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="system-page">
      <section className="system-card" role="alert">
        <span className="brand-mark" aria-hidden="true">ه</span>
        <p className="eyebrow">بازیابی امن</p>
        <h1>این بخش موقتاً در دسترس نیست</h1>
        <p>اطلاعاتت حذف نشده است. دوباره تلاش کن؛ اگر مشکل ادامه داشت، صفحه را تازه‌سازی کن.</p>
        <div className="system-actions">
          <button className="primary-button" onClick={() => retry()}>تلاش دوباره</button>
          <Link className="outline-button" href="/">بازگشت به همراه</Link>
        </div>
      </section>
    </main>
  );
}
