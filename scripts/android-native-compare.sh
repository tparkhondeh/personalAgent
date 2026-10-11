#!/usr/bin/env bash
# Diagnostic only: fresh CI emulator, unchanged baseline/candidate, no user data.
set -Eeuo pipefail
variant="$1"
[[ "${CI:-}" == true && "$(adb get-serialno)" =~ ^emulator-[0-9]+$ ]]
[[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]]
[[ "$(adb shell getprop ro.build.version.sdk | tr -d '\r')" == 36 ]]
[[ "$variant" == baseline44 || "$variant" == candidate45 ]]
package_name=ir.wealthos.personalagent.stable40
out="artifacts/native-compare/$variant"
mkdir -p "$out"
if adb shell pm path "$package_name" | grep -q '^package:'; then
  echo 'Comparison requires a fresh emulator; existing installation preserved' >&2
  exit 1
fi
apk=artifacts/personal-signed/tia-1.0.45.apk
if [[ "$variant" == baseline44 ]]; then apk=artifacts/upgrade-from-44.apk; fi
sha256sum "$apk" > "$out/apk-sha256.txt"
adb install "$apk"
adb install -t artifacts/personal-signed/tia-personal-test.apk
adb shell pm grant "$package_name" android.permission.POST_NOTIFICATIONS
adb shell appops set "$package_name" SCHEDULE_EXACT_ALARM allow
adb shell dumpsys webviewupdate > "$out/webview-provider.txt"
adb shell getprop ro.build.fingerprint > "$out/system-fingerprint.txt"
original_proxy="$(adb shell settings get global http_proxy | tr -d '\r')"
trap 'adb shell settings put global http_proxy "$original_proxy" >/dev/null 2>&1 || true' EXIT
failed=0
for mode in online offline; do
  adb shell am force-stop "$package_name"
  if [[ "$mode" == offline ]]; then adb shell settings put global http_proxy 127.0.0.1:9;
  else adb shell settings put global http_proxy :0; fi
  # Each mode starts a process once; no retry, reinstall, data reset or log clearing.
  timeout 90s adb shell am instrument -w \
    -e class ir.wealthos.personalagent.ApplicationContextTest#repeatedAlarmActivityRecreationKeepsDataAndDoesNotCrash \
    "$package_name.test/ir.wealthos.personalagent.ReleaseQaRunner" > "$out/$mode.txt" 2>&1 || failed=1
  adb logcat -d > "$out/$mode-logcat.txt"
  grep -Fq 'OK (1 test)' "$out/$mode.txt" || failed=1
done
echo "Diagnostic only; baseline/candidate acceptance is separate; failed=$failed"
exit "$failed"
