#!/usr/bin/env bash

set -Eeuo pipefail

package_name="ir.wealthos.personalagent"
activity_name="$package_name/.MainActivity"
apk_path="android/app/build/outputs/apk/debug/app-debug.apk"
evidence_dir="artifacts/android"

mkdir -p "$evidence_dir"

collect_evidence() {
  adb shell dumpsys activity activities > "$evidence_dir/activity.txt" 2>&1 || true
  adb shell dumpsys package "$package_name" > "$evidence_dir/package.txt" 2>&1 || true
  adb shell uiautomator dump /sdcard/hamrah-window.xml > "$evidence_dir/uiautomator-command.txt" 2>&1 || true
  adb pull /sdcard/hamrah-window.xml "$evidence_dir/window.xml" > /dev/null 2>&1 || true
  adb exec-out screencap -p > "$evidence_dir/emulator.png" 2>/dev/null || true
  adb logcat -d > "$evidence_dir/logcat.txt" 2>&1 || true
}

trap collect_evidence EXIT

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0

# Preserve boot diagnostics separately; every app-test failure remains in logcat.
adb logcat -d > "$evidence_dir/pre-install-logcat.txt"
adb logcat -c
adb install -r "$apk_path"
adb shell pm grant "$package_name" android.permission.POST_NOTIFICATIONS || true
adb shell appops set "$package_name" SCHEDULE_EXACT_ALARM allow || true

./android/gradlew -p android --no-daemon :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.allowEmulatorServer=true

adb install -r "$apk_path"
adb shell pm grant "$package_name" android.permission.POST_NOTIFICATIONS || true
adb shell appops set "$package_name" SCHEDULE_EXACT_ALARM allow || true
adb shell am force-stop "$package_name"

start_output="$(adb shell am start -W -n "$activity_name")"
printf '%s\n' "$start_output" | tee "$evidence_dir/activity-start.txt"
grep -Fq "Status: ok" "$evidence_dir/activity-start.txt"

sleep 10

process_id="$(adb shell pidof "$package_name" | tr -d '\r')"
if [[ -z "$process_id" ]]; then
  echo "Android app process is not running after launch." >&2
  exit 1
fi

adb shell dumpsys package "$package_name" > "$evidence_dir/package-before-exit.txt"
grep -Fq "android.permission.POST_NOTIFICATIONS" "$evidence_dir/package-before-exit.txt"
grep -Fq "android.permission.SCHEDULE_EXACT_ALARM" "$evidence_dir/package-before-exit.txt"

node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/cold-launch-webview.json" "فهرست برنامه‌ها"
node scripts/android-system-ui-check.mjs "$evidence_dir/cold-launch-system-ui" inspect "$evidence_dir/cold-launch.png"
adb logcat -d > "$evidence_dir/app-tests-logcat.txt"
node scripts/android-logcat-check.mjs "$evidence_dir/app-tests-logcat.txt" \
  "$evidence_dir/cold-launch-system-ui-result.json" "$evidence_dir/app-tests-log-verification.json"

echo "Hamrah cold launch rendered Persian RTL content, with unobscured UI and checked app logs (process $process_id)."
