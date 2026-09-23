// Verify exact signed bytes before any emulator installation or release.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inspectApk } from "./verify-android-upgrade.mjs";

const directory = path.resolve(process.argv[2] || "artifacts/personal-signed");
const policy = JSON.parse(readFileSync("android/personal-release.json", "utf8"));
const meta = JSON.parse(readFileSync(path.join(directory, "metadata.json"), "utf8"));
assert.equal(meta.packageId, policy.packageId);
assert.equal(meta.endpoint, policy.endpoint);
assert(Number.isSafeInteger(meta.versionCode) && meta.versionCode >= policy.minimumVersionCode);
assert.equal(meta.apk, `tia-1.0.${meta.versionCode}.apk`);
assert(/^[a-f0-9]{40}$/.test(meta.commit));
const options = { sdkRoot: process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME, javaHome: process.env.JAVA_HOME };
const checked = [];
const files = [meta.apk, "tia-personal-test.apk", "diagnostic-dns.apk", "diagnostic-server-down.apk", "diagnostic-ssl.apk"];
assert.deepEqual(Object.keys(meta.files).sort(), [...files].sort());
for (const name of files) {
  const file = path.join(directory, name);
  const identity = await inspectApk(file, options);
  assert.deepEqual(identity.certificates, [policy.certificateSha256]);
  assert.equal(identity.sha256, meta.files[name]);
  assert.equal(identity.packageId, policy.packageId + (name === "tia-personal-test.apk" ? ".test" : ""));
  if (name !== "tia-personal-test.apk") assert.equal(identity.versionCode, meta.versionCode);
  checked.push({ name, sha256: identity.sha256 });
}
const main = path.join(directory, meta.apk);
const command = (file, args) => execFileSync(file, args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
const extract = name => process.platform === "win32" ? command("tar", ["-xOf", main, name]) : command("unzip", ["-p", main, name]);
const config = JSON.parse(extract("assets/capacitor.config.json"));
assert.equal(config.server.url, policy.endpoint);
assert.equal(config.server.cleartext, false);
assert.equal(config.server.errorPath, "connection-error.html");
assert.equal(config.android.webContentsDebuggingEnabled, false);
assert.equal(config.android.allowMixedContent, false);
assert.equal(config.loggingBehavior, "none");
const build = JSON.parse(extract("assets/public/tia-build.json"));
assert.equal(build.commit, meta.commit);
assert.equal(build.packageId, policy.packageId);
assert.equal(build.versionCode, meta.versionCode);
const tools = path.join(options.sdkRoot, "build-tools", "35.0.0");
const badging = command(path.join(tools, "aapt" + (process.platform === "win32" ? ".exe" : "")), ["dump", "badging", main]);
assert(!badging.includes("application-debuggable"));
assert(badging.includes("application-label:'tia'"));
const entries = process.platform === "win32" ? command("tar", ["-tf", main]) : command("unzip", ["-Z1", main]);
assert(!entries.split(/\r?\n/).some(name => /(?:^|\/)\.env|\.(?:keystore|jks|p12|pfx|dpapi)$/i.test(name)));
for (const name of entries.split(/\r?\n/).filter(name => /^classes\d*\.dex$/.test(name))) {
  assert(!extract(name).includes("ReleaseQaRunner"), "QA runner must not enter the delivery APK");
}
command(path.join(tools, "zipalign" + (process.platform === "win32" ? ".exe" : "")), ["-c", "-P", "16", "4", main]);
writeFileSync(path.join(directory, "verified-identity.json"), JSON.stringify({ passed: true, checked, debug: false, endpoint: policy.endpoint, certificateSha256: policy.certificateSha256 }, null, 2));
console.log(JSON.stringify({ passed: true, packageId: policy.packageId, versionCode: meta.versionCode, apkSha256: meta.files[meta.apk], filesVerified: checked.length }));
