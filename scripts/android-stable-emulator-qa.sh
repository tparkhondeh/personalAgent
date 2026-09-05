#!/usr/bin/env bash

set -Eeuo pipefail

package_name="$1"
stable_apk="$2"
test_apk="$3"
dns_apk="$4"
server_down_apk="$5"
ssl_apk="$6"
api_level="$7"
evidence_dir="artifacts/evidence/android-${api_level}"
activity_name="${package_name}/ir.wealthos.personalagent.MainActivity"

mkdir -p "$evidence_dir"

collect_evidence() {
  adb shell dumpsys activity activities > "$evidence_dir/activity.txt" 2>&1 || true
  adb shell dumpsys package "$package_name" > "$evidence_dir/package.txt" 2>&1 || true
  adb logcat -d > "$evidence_dir/logcat.txt" 2>&1 || true
}
trap collect_evidence EXIT

launch_and_verify() {
  local label="$1"
  local expected="$2"
  local action="${3:-}"
  adb shell am force-stop "$package_name"
  adb logcat -c
  adb shell am start -W -n "$activity_name" | tee "$evidence_dir/${label}-launch.txt"
  sleep 6
  node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/${label}-webview.json" "$expected" "$action"
  adb exec-out screencap -p > "$evidence_dir/${label}.png"
  adb logcat -d > "$evidence_dir/${label}-logcat.txt"
  if grep -E "FATAL EXCEPTION|Fatal signal|SIGSEGV|Uncaught (TypeError|ReferenceError|SyntaxError)|SSL.*proceed" "$evidence_dir/${label}-logcat.txt"; then
    echo "A fatal Android, JavaScript, renderer or unsafe SSL error was found in $label." >&2
    return 1
  fi
}

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell svc wifi enable || true
adb shell svc data enable || true

adb install -r "$stable_apk"
adb shell pm grant "$package_name" android.permission.POST_NOTIFICATIONS || true
adb shell appops set "$package_name" SCHEDULE_EXACT_ALARM allow || true
launch_and_verify "stable-network-enabled" "خوش برگشتی"

adb install -r "$test_apk"
adb shell am instrument -w "${package_name}.test/androidx.test.runner.AndroidJUnitRunner" \
  | tee "$evidence_dir/instrumented-tests.txt"
grep -Fq "OK (" "$evidence_dir/instrumented-tests.txt"

adb shell svc wifi disable || true
adb shell svc data disable || true
launch_and_verify "stable-offline" "اتصال برقرار نشد"
node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/stable-local-fallback-webview.json" "برنامه‌های من" "open-offline"
adb exec-out screencap -p > "$evidence_dir/stable-local-fallback.png"
launch_and_verify "stable-offline-relaunch" "اتصال برقرار نشد"

adb shell svc wifi enable || true
adb shell svc data enable || true
adb install -r "$dns_apk"
launch_and_verify "dns-failure-recovery" "اتصال برقرار نشد"

adb install -r "$server_down_apk"
launch_and_verify "server-down-recovery" "اتصال برقرار نشد"

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$evidence_dir/test-key.pem" -out "$evidence_dir/test-cert.pem" \
  -subj "/CN=10.0.2.2" >/dev/null 2>&1
openssl s_server -quiet -accept 8443 -key "$evidence_dir/test-key.pem" \
  -cert "$evidence_dir/test-cert.pem" -WWW > "$evidence_dir/ssl-server.log" 2>&1 &
ssl_server_pid=$!
adb install -r "$ssl_apk"
launch_and_verify "ssl-failure-recovery" "اتصال برقرار نشد"
kill "$ssl_server_pid" 2>/dev/null || true
rm -f "$evidence_dir/test-key.pem"

adb install -r "$stable_apk"
launch_and_verify "stable-restored" "خوش برگشتی"

printf 'Android %s passed: real Persian UI, offline relaunch, DNS, server-down and SSL recovery.\n' "$api_level" \
  | tee "$evidence_dir/result.txt"
