import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-page">
      <section className="system-card">
        <span className="brand-mark" aria-hidden="true">ه</span>
        <p className="eyebrow">مسیر نامعتبر</p>
        <h1>این صفحه پیدا نشد</h1>
        <p>ممکن است نشانی اشتباه باشد یا این بخش جابه‌جا شده باشد.</p>
        <Link className="primary-button" href="/">بازگشت به همراه</Link>
      </section>
    </main>
  );
}
