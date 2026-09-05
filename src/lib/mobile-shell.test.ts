import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve(process.cwd(), "mobile-shell/index.html"), "utf8");
const mobileScript = readFileSync(resolve(process.cwd(), "mobile-shell/app.js"), "utf8");
const mobileStyles = readFileSync(resolve(process.cwd(), "mobile-shell/app.css"), "utf8");
const recoveryHtml = readFileSync(resolve(process.cwd(), "mobile-shell/connection-error.html"), "utf8");
const capacitorConfig = readFileSync(resolve(process.cwd(), "capacitor.config.ts"), "utf8");
const mainActivity = readFileSync(
  resolve(process.cwd(), "android/app/src/main/java/ir/wealthos/personalagent/MainActivity.java"),
  "utf8",
);

describe("offline Android mobile shell", () => {
  it("is RTL, local-first and independent from a remote server", () => {
    expect(html).toContain('<html lang="fa" dir="rtl">');
    expect(mobileScript).toContain("localStorage");
    expect(mobileScript).toContain("LocalNotifications");
    expect(html).not.toMatch(/https?:\/\//);
    expect(mobileScript).not.toMatch(/https?:\/\//);
  });

  it("contains valid executable JavaScript", () => {
    expect(() => new Function(mobileScript)).not.toThrow();
  });

  it("keeps the essential dashboard usable inside the APK", () => {
    expect(html).toContain("برنامه‌های من");
    expect(html).toContain("تقویم این ماه");
    expect(html).toContain("همراه هوشمند محلی");
    expect(html).toContain("زنگ آزمایشی ۳۰ ثانیه‌ای");
    expect(mobileStyles).toContain("Vazirmatn.woff2");
    expect(mobileStyles).toContain("prefers-color-scheme:dark");
  });

  it("provides a local Persian recovery screen for connected builds", () => {
    expect(recoveryHtml).toContain('<html lang="fa" dir="rtl">');
    expect(recoveryHtml).toContain("اتصال برقرار نشد");
    expect(recoveryHtml).toContain("تلاش دوباره");
    expect(recoveryHtml).toContain("ادامه در حالت محلی");
    expect(recoveryHtml).toContain('location.replace("./index.html")');
    expect(recoveryHtml).toContain('document.querySelector("#offline").addEventListener');
    expect(recoveryHtml).not.toMatch(/https?:\/\//);
    expect(capacitorConfig).toContain('errorPath: "connection-error.html"');
    expect(capacitorConfig).toContain('allowNavigation: ["localhost"]');
  });

  it("guards Android WebView loading without bypassing SSL errors", () => {
    expect(mainActivity).toContain("LOAD_TIMEOUT_MS");
    expect(mainActivity).toContain("showRecoveryPage");
    expect(mainActivity).toContain("handler.cancel()");
    expect(mainActivity).toContain("HamrahRecovery");
    expect(mainActivity).toContain("clearDataWhenEndpointChanges");
    expect(mainActivity).toContain("WebStorage.getInstance().deleteAllData()");
  });
});
