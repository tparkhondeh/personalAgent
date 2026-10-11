#!/usr/bin/env bash
# Diagnostic only; never install this on a real device or publish it as tia.
set -Eeuo pipefail
blank="${1:?Teardown variant required}"
[[ "$blank" == true || "$blank" == false ]]
[[ "${CI:-}" == true && "$(adb get-serialno)" =~ ^emulator-[0-9]+$ ]]
[[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]]
package=ir.wealthos.tia.webviewprobe
mkdir -p artifacts/probe
adb shell dumpsys webviewupdate > artifacts/probe/provider.txt
adb shell getprop ro.build.fingerprint > artifacts/probe/fingerprint.txt
mapfile -t apks < <(find diagnostics/webview-lifecycle/build/outputs/apk/debug -maxdepth 1 -name '*.apk' -type f)
[[ "${#apks[@]}" == 1 ]]
sha256sum "${apks[0]}" > artifacts/probe/apk-sha256.txt
adb install "${apks[0]}"
adb logcat -c
adb shell am start -W -n "$package/.ProbeActivity" --ez blank "$blank"
# One run, bounded grace period, no crash retry or provider replacement.
sleep 45
adb logcat -d > artifacts/probe/logcat.txt
adb exec-out screencap -p > artifacts/probe/screen.png
grep 'TiaWebViewProbe' artifacts/probe/logcat.txt > artifacts/probe/progress.txt || true
grep -Fq 'COMPLETE eight cycles' artifacts/probe/progress.txt
if grep -Eq 'Fatal signal|FATAL EXCEPTION|SIGSEGV' artifacts/probe/logcat.txt; then
  echo 'Framework diagnostic failed; inspect logs; no product acceptance inferred' >&2
  exit 1
fi
echo 'Framework-only reproduction passed; this is NOT APK acceptance.'
