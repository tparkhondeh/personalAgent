"use client";

const pageStyle = { minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", background: "radial-gradient(circle at 18% 18%, #eee9ff, transparent 34%), radial-gradient(circle at 82% 82%, #e4f7ee, transparent 34%), #f7f7ff", color: "#303448", fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif", direction: "rtl" as const };
const cardStyle = { width: "min(100%, 520px)", padding: "32px", border: "1px solid #e1e4f1", borderRadius: "24px", background: "rgba(255, 255, 255, 0.92)", boxShadow: "0 24px 65px rgba(79, 85, 127, 0.14)", textAlign: "right" as const };
const buttonStyle = { minHeight: "46px", padding: "10px 18px", border: 0, borderRadius: "14px", background: "#5c70b4", color: "#fff", font: "inherit", fontWeight: 680, cursor: "pointer" };

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0 }}>
        <main style={pageStyle}>
          <section style={cardStyle} role="alert">
            <h1 style={{ margin: "0 0 12px", fontSize: "28px" }}>همراه نیاز به راه‌اندازی دوباره دارد</h1>
            <p style={{ margin: "0 0 22px", lineHeight: 2 }}>اطلاعات شما حذف نشده است. برای بارگذاری دوباره برنامه تلاش کنید.</p>
            <button style={buttonStyle} onClick={() => retry()}>تلاش دوباره</button>
          </section>
        </main>
      </body>
    </html>
  );
}
