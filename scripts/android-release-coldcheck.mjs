// Actual non-debuggable delivery launch WITHOUT the signed QA instrumentation.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { captureHierarchy, systemDialog } from "./android-system-ui-check.mjs";

const [packageName, output, api, expectation] = process.argv.slice(2);
assert.equal(packageName, "ir.wealthos.personalagent.stable40");
assert(["33", "34", "36"].includes(api));
assert(["online", "recovery"].includes(expectation));
mkdirSync(output, { recursive: true });
const adb = (...args) => execFileSync("adb", args, { encoding: "utf8", timeout: 45000 }).trim();
adb("shell", "am", "force-stop", packageName);
adb("logcat", "-c");
adb("shell", "am", "start", "-W", "-n", `${packageName}/ir.wealthos.personalagent.MainActivity`);
const expected = expectation === "online" ? "فهرست برنامه‌ها" : "اتصال برقرار نشد";
let xml = "";
for (let attempt = 0; attempt < 12; attempt++) {
  xml = await captureHierarchy(adb, entry => writeFileSync(`${output}/cold-capture-${attempt}-${entry.attempt}.json`, JSON.stringify(entry)));
  writeFileSync(`${output}/cold-${attempt}.xml`, xml);
  assert(!systemDialog(xml).blocked, "A system error obscures the release");
  if (xml.includes(expected)) break;
  await new Promise(resolve => setTimeout(resolve, 2000));
}
assert(xml.includes(expected), "Expected real Persian release UI");
const pkg = adb("shell", "dumpsys", "package", packageName);
assert(!/\bDEBUGGABLE\b/.test(pkg), "Delivery must not be debuggable");
const pid = adb("shell", "pidof", packageName).split(/\s+/)[0];
assert(/^\d+$/.test(pid));
const sockets = adb("shell", "cat", "/proc/net/unix");
assert(!sockets.includes(`webview_devtools_remote_${pid}`), "Cold release must not expose WebView debugging");
writeFileSync(`${output}/android-${api}-release-cold.png`, execFileSync("adb", ["exec-out", "screencap", "-p"]));
writeFileSync(`${output}/release-cold-logcat.txt`, adb("logcat", "-d"));
writeFileSync(`${output}/release-cold-system-ui-result.json`, JSON.stringify({ clear: true, preInstallLauncherWait: false, blockedBy: null }));
execFileSync(process.execPath, ["scripts/android-logcat-check.mjs", `${output}/release-cold-logcat.txt`, `${output}/release-cold-system-ui-result.json`, `${output}/release-cold-log-verification.json`], { stdio: "inherit" });
writeFileSync(`${output}/release-cold.json`, JSON.stringify({ passed: true, api: Number(api), instrumentation: false, debuggable: false, webViewDebugSocket: false, expectedText: expected }));
