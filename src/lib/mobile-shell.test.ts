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
const alarmPlugin = readFileSync(resolve(process.cwd(), "android/app/src/main/java/ir/wealthos/personalagent/TiaAlarmSoundsPlugin.java"), "utf8");
const alarmPatch = readFileSync(resolve(process.cwd(), "patches/@capacitor__local-notifications@8.3.1.patch"), "utf8");
const installedNotifications = resolve(process.cwd(), "node_modules/@capacitor/local-notifications");

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
    expect(html).toContain("برنامه امروز");
    expect(html).toContain("تقویم این ماه");
    expect(html).toContain('id="assistant-input"');
    expect(html).toContain('id="voice-start"');
    expect(html).toContain("زنگ آزمایشی ۳۰ ثانیه‌ای");
    expect(mobileStyles).toContain("Vazirmatn.woff2");
    expect(mobileStyles).toContain(':root[data-theme="dark"]');
    expect(mobileStyles).not.toContain("prefers-color-scheme");
  });

  it("provides a local Persian recovery screen for connected builds", () => {
    expect(recoveryHtml).toContain('<html lang="fa" dir="rtl">');
    expect(recoveryHtml).toContain("اتصال برقرار نشد");
    expect(recoveryHtml).toContain("تلاش دوباره");
    expect(recoveryHtml).toContain("ادامه در حالت محلی");
    expect(recoveryHtml).toContain("const bundledDocument =");
    expect(recoveryHtml).toContain("const bundledScript =");
    expect(recoveryHtml).toContain("document.write(bundledDocument)");
    expect(recoveryHtml).toContain("offlineRuntime.textContent = bundledScript");
    expect(recoveryHtml).toContain("برنامه امروز");
    expect(recoveryHtml).not.toContain("fetch(\"./index.html\"");
    expect(recoveryHtml).toContain("window.HamrahOpenBundledInterface = openBundledInterface");
    expect(recoveryHtml).toContain('document.querySelector("#offline").addEventListener');
    // localhost is the APK's private asset origin, not a server dependency.
    expect(recoveryHtml.replaceAll('https://localhost','')).not.toMatch(/https?:\/\//);
    expect(capacitorConfig).toContain('errorPath: "connection-error.html"');
    expect(capacitorConfig).toContain('allowNavigation: ["localhost"]');
  });

  it("guards Android WebView loading without bypassing SSL errors", () => {
    expect(mainActivity).toContain("LOAD_TIMEOUT_MS");
    expect(mainActivity).toContain("showRecoveryPage");
    expect(mainActivity).toContain("handler.cancel()");
    expect(mainActivity).toContain("HamrahRecovery");
    expect(mainActivity).toContain("refreshCodeCacheWhenEndpointChanges(webView)");
    expect(mainActivity).toContain("EndpointCodeCache.refresh(previousEndpoint, endpoint, () -> {");
    expect(mainActivity).toContain("webView.clearCache(true)");
    // Endpoint migration must never delete offline data, account state or cookies.
    expect(mainActivity).not.toMatch(/WebStorage|CookieManager|deleteAllData|deleteOrigin|removeAllCookies|removeSessionCookies|clearHistory\s*\(/);
  });

  it("injects offline notifications only into the exact trusted main-frame asset", () => {
    expect(mainActivity).toContain('request.isForMainFrame() && request.getUrl().toString().equals(getBridge().getErrorUrl())');
    expect(mainActivity).toContain('getAssets().open("public/connection-error.html")');
    expect(mainActivity).toContain('JSExport.getPluginJS(recoveryPlugins)');
    const recoveryBlock = mainActivity.slice(mainActivity.indexOf('if (request.isForMainFrame() && request.getUrl().toString().equals(getBridge().getErrorUrl()))'));
    expect(recoveryBlock).toContain('getPlugin("LocalNotifications")');
    expect(recoveryBlock).toContain('getPlugin("TiaAlarmSounds")');
    expect([...recoveryBlock.matchAll(/recoveryPlugins\.add\((\w+)\)/g)].map(match => match[1])).toEqual(["notifications", "alarmSounds"]);
    expect(recoveryBlock).not.toContain('getPlugins()');
    expect(mainActivity).toContain('return getBridge().getScheme() + "://" + getBridge().getHost()');
    expect(mainActivity).not.toContain('getBridge().getLocalUrl()');
  });
});

describe("versioned Android 7 alarm compatibility", () => {
  it("installs only the pinned local-notifications patch and preserves the existing Capacitor patch", () => {
    const workspace = readFileSync(resolve(process.cwd(), "pnpm-workspace.yaml"), "utf8");
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    const installed = JSON.parse(readFileSync(resolve(installedNotifications, "package.json"), "utf8"));
    expect(manifest.dependencies["@capacitor/local-notifications"]).toBe("8.3.1");
    expect(installed.version).toBe("8.3.1");
    expect(workspace).toContain("'@capacitor/local-notifications@8.3.1': patches/@capacitor__local-notifications@8.3.1.patch");
    expect(workspace).toContain("'@capacitor/android@8.5.0': patches/@capacitor__android@8.5.0.patch");
    expect([...alarmPatch.matchAll(/^diff --git a\/(\S+) b\//gm)].map(match => match[1])).toEqual([
      "android/src/main/java/com/capacitorjs/plugins/localnotifications/TiaAlarmChannels.java",
      "android/src/main/kotlin/com/capacitorjs/plugins/localnotifications/LocalNotificationManager.kt",
    ]);
  });

  it("routes the actual installed notification builder through the alarm stream only for exact owned IDs", () => {
    const manager = readFileSync(resolve(installedNotifications, "android/src/main/kotlin/com/capacitorjs/plugins/localnotifications/LocalNotificationManager.kt"), "utf8");
    const channels = readFileSync(resolve(installedNotifications, "android/src/main/java/com/capacitorjs/plugins/localnotifications/TiaAlarmChannels.java"), "utf8");
    expect(manager).toMatch(/if \(TiaAlarmChannels\.usesLegacyAlarmStream\(Build\.VERSION\.SDK_INT, channelId\)\)\s*\{\s*mBuilder\.setSound\(soundUri, AudioManager\.STREAM_ALARM\)\s*\} else \{\s*mBuilder\.setSound\(soundUri\)/);
    expect(channels).toContain("sdkInt >= 24 && sdkInt < 26");
    expect([...channels.matchAll(/"([^"]+)"\.equals\(channelId\)/g)].map(match => match[1])).toEqual([
      "tia-alarm-v1-dawn", "tia-alarm-v1-chime", "tia-alarm-v1-pulse",
    ]);
    expect(channels).not.toMatch(/startsWith|contains\(/);
    expect(alarmPatch).not.toMatch(/setStreamVolume|adjustStreamVolume|setInterruptionFilter|uses-permission/);
  });

  it("allows selection on API24/25 but guards every channel operation behind API26", () => {
    const selection = alarmPlugin.slice(alarmPlugin.indexOf("public void getSelection("), alarmPlugin.indexOf("public synchronized void setSelection("));
    const ensure = alarmPlugin.slice(alarmPlugin.indexOf("public synchronized void ensureChannel("), alarmPlugin.indexOf("public void preview("));
    expect(selection).toContain("requireAsset(id)");
    expect(selection).not.toMatch(/VERSION|call\.unavailable/);
    expect(ensure).toContain("requireAsset(id)");
    expect(ensure).toContain("Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(channelId) == null");
    expect(ensure).toContain("call.resolve(new JSObject().put(\"soundId\", id).put(\"channelId\", channelId))");
    expect(ensure).not.toMatch(/call\.unavailable|deleteNotificationChannel|put\("(?:connected|granted|delivered)"/);
    expect(ensure.indexOf("createNotificationChannel")).toBeGreaterThan(ensure.indexOf("Build.VERSION.SDK_INT >= Build.VERSION_CODES.O"));
  });
});
