#!/usr/bin/env bash
# Additional evidence only. This never changes a failed acceptance into a pass.
set -Eeuo pipefail
package_name="$1"
runner="$2"
evidence_dir="$3"
[[ "${CI:-}" == true && "$(adb get-serialno)" =~ ^emulator-[0-9]+$ ]]
[[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]]
[[ "$package_name" == ir.wealthos.personalagent.stable40 ]]
original_proxy="$(adb shell settings get global http_proxy | tr -d '\r')"
restore_proxy() { adb shell settings put global http_proxy "$original_proxy" >/dev/null 2>&1 || true; }
trap restore_proxy EXIT
adb logcat -d > "$evidence_dir/native-failure-original-logcat.txt"
adb shell dumpsys webviewupdate > "$evidence_dir/native-failure-webview-provider.txt"
for mode in online offline; do
  adb shell am force-stop "$package_name"
  if [[ "$mode" == offline ]]; then adb shell settings put global http_proxy 127.0.0.1:9;
  else adb shell settings put global http_proxy :0; fi
  # Fresh process, same signed APK and data; no uninstall, reset or app mutation.
  timeout 90s adb shell am instrument -w \
    -e class ir.wealthos.personalagent.ApplicationContextTest#alarmSoundBridgePersistsChoiceAndPreservesPendingChannels \
    "$package_name.test/$runner" > "$evidence_dir/native-isolated-$mode.txt" 2>&1 || true
  adb logcat -d > "$evidence_dir/native-isolated-$mode-logcat.txt"
done
