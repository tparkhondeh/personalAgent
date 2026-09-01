"use client";

const pageStyle = { minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", background: "#f6f7f2", color: "#26312c", fontFamily: "Vazirmatn, Tahoma, Arial, sans-serif", direction: "rtl" as const };
const cardStyle = { width: "min(100%, 520px)", padding: "32px", border: "1px solid #dfe5dc", borderRadius: "24px", background: "#fff", boxShadow: "0 18px 50px rgba(47, 62, 51, 0.1)", textAlign: "right" as const };
const buttonStyle = { minHeight: "46px", padding: "10px 18px", border: 0, borderRadius: "14px", background: "#748d76", color: "#fff", font: "inherit", cursor: "pointer" };

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
