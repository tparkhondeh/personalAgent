// Build once, without a signing key. Signing and permanent-key custody stay off CI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const version = process.env.TIA_PERSONAL_VERSION;
assert(/^[1-9][0-9]{1,7}$/.test(version || "") && Number(version) > 40);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert(/^[a-f0-9]{40}$/.test(commit));
const output = "artifacts/personal-unsigned";
assert(!existsSync(output), "Use a fresh build destination; preserve earlier candidates");
mkdirSync(output, { recursive: true });
const run = (command, args, env = {}) => execFileSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
const props = ["-p", "android", "--no-daemon", "-PtiaPersonalRelease=true", `-PtiaPersonalVersion=${version}`];
const identity = { appName: "tia", packageId: "ir.wealthos.personalagent.stable40", versionCode: Number(version), versionName: `1.0.${version}`, commit, workflowRun: process.env.GITHUB_RUN_ID || null };
const stringsPath = "android/app/src/main/res/values/strings.xml";
const original = readFileSync(stringsPath, "utf8");
let strings = original;
for (const name of ["package_name", "custom_url_scheme"]) {
  const expression = new RegExp(`(<string name="${name}">)[^<]+(</string>)`);
  assert(expression.test(strings));
  strings = strings.replace(expression, (_match, start, end) => start + identity.packageId + end);
}
writeFileSync(stringsPath, strings);
const files = {};
function collect(source, name) {
  const destination = path.join(output, name);
  assert(existsSync(source) && !existsSync(destination));
  copyFileSync(source, destination);
  files[name] = createHash("sha256").update(readFileSync(destination)).digest("hex");
}
function sync(url, diagnostic = false) {
  run("pnpm", ["exec", "cap", "sync", "android"], { CAPACITOR_SERVER_URL: url, TIA_ANDROID_PERSONAL: "true", TIA_ANDROID_DIAGNOSTIC: String(diagnostic) });
}
try {
  run("pnpm", ["speech:prepare"]);
  run("node", ["scripts/generate-android-assets.mjs"]);
  writeFileSync("mobile-shell/tia-build.json", JSON.stringify(identity));
  sync("https://personalagent.wealthos.ir:8443");
  run("bash", ["android/gradlew", ...props, ":app:lintRelease", ":app:testReleaseUnitTest", ":app:assembleRelease", ":app:assembleReleaseAndroidTest"]);
  run("node", ["scripts/verify-android-speech-assets.mjs", "android/app/build/outputs/apk/release/app-release-unsigned.apk"]);
  collect("android/app/build/outputs/apk/release/app-release-unsigned.apk", "tia-personal-unsigned.apk");
  collect("android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk", "tia-personal-test.apk");
  for (const [name, url] of [["dns", "https://unreachable.invalid"], ["server-down", "https://10.0.2.2:65534"], ["ssl", "https://10.0.2.2:8443"]]) {
    sync(url, true);
    run("bash", ["android/gradlew", ...props, ":app:assembleRelease"]);
    collect("android/app/build/outputs/apk/release/app-release-unsigned.apk", `diagnostic-${name}.apk`);
  }
  writeFileSync(path.join(output, "unsigned-metadata.json"), JSON.stringify({ ...identity, files, signingKeyInCi: false, endpoint: "https://personalagent.wealthos.ir:8443", diagnosticFilesAreNotDeliverables: true }, null, 2));
} finally {
  writeFileSync(stringsPath, original);
}
