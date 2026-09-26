#!/usr/bin/env bash

set -Eeuo pipefail

package_name="$1"
stable_apk="$2"
test_apk="$3"
dns_apk="$4"
server_down_apk="$5"
ssl_apk="$6"
api_level="$7"
staging_expectation="${STAGING_EXPECTATION:-online}"
release_inspection="${TIA_RELEASE_INSPECTION:-false}"
runner="androidx.test.runner.AndroidJUnitRunner"
if [[ "$release_inspection" == true ]]; then runner="ir.wealthos.personalagent.ReleaseQaRunner"; fi
evidence_dir="artifacts/evidence/android-${api_level}"
activity_name="${package_name}/ir.wealthos.personalagent.MainActivity"

mkdir -p "$evidence_dir"

collect_evidence() {
  adb shell dumpsys activity activities > "$evidence_dir/activity.txt" 2>&1 || true
  adb shell dumpsys package "$package_name" > "$evidence_dir/package.txt" 2>&1 || true
  adb logcat -d > "$evidence_dir/logcat.txt" 2>&1 || true
}
trap collect_evidence EXIT

capture_verified() {
  local label="$1"
  node scripts/android-system-ui-check.mjs "$evidence_dir/${label}-system-ui" inspect "$evidence_dir/android-${api_level}-${label}.png"
}

launch_and_verify() {
  local label="$1"
  local expected="$2"
  local action="${3:-}"
  local appearance_qa="${4:-}"
  adb shell am force-stop "$package_name"
  adb logcat -c
  if [[ "$release_inspection" == true ]]; then
    local inspection_args=(-e tiaInspection true)
    if [[ -n "$appearance_qa" ]]; then
      [[ "${CI:-}" == true && "$(adb get-serialno)" =~ ^emulator-[0-9]+$ && "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]]
      inspection_args+=(-e tiaAppearanceQa "$appearance_qa")
      if [[ "$appearance_qa" == restore-upgrade ]]; then
        [[ "${upgrade_appearance_verified:-}" == true ]]
        inspection_args+=(-e tiaUpgradeAppearanceVerified 43-to-44)
      fi
    fi
    adb shell am instrument -w "${inspection_args[@]}" "${package_name}.test/$runner" > "$evidence_dir/${label}-inspection.txt" 2>&1 &
    local ready=false
    for attempt in {1..40}; do
      if grep -Fq TIA_RELEASE_INSPECTION_READY "$evidence_dir/${label}-inspection.txt"; then ready=true; break; fi
      if grep -Fq TIA_RELEASE_INSPECTION_FAILED "$evidence_dir/${label}-inspection.txt"; then break; fi
      sleep 1
    done
    [[ "$ready" == true ]]
    if [[ -n "$appearance_qa" ]]; then grep -Fq TIA_QA_NATIVE_APPEARANCE_ABSENT "$evidence_dir/${label}-inspection.txt"; fi
  else
    adb shell am start -W -n "$activity_name" | tee "$evidence_dir/${label}-launch.txt"
  fi
  sleep 6
  node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/${label}-webview.json" "$expected" "$action"
  capture_verified "$label"
  adb logcat -d > "$evidence_dir/${label}-logcat.txt"
  node scripts/android-logcat-check.mjs "$evidence_dir/${label}-logcat.txt" \
    "$evidence_dir/${label}-system-ui-result.json" "$evidence_dir/${label}-log-verification.json"
}

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell settings put global http_proxy :0 || true
adb shell svc wifi enable || true
adb shell svc data enable || true
adb shell cmd uimode night yes

if [[ -n "${TIA_UPGRADE_BASELINE_APK:-}" ]]; then
  [[ "$release_inspection" == true && -f "$TIA_UPGRADE_BASELINE_APK" ]]
  # The workflow separately verified hash, signer, package and increasing version.
  # This is a fresh synthetic emulator, never a connected owner's phone.
  adb install "$TIA_UPGRADE_BASELINE_APK"
  adb install -t "$test_apk"
  adb shell pm grant "$package_name" android.permission.POST_NOTIFICATIONS
  adb shell appops set "$package_name" SCHEDULE_EXACT_ALARM allow
  adb shell settings put global http_proxy 127.0.0.1:9
  launch_and_verify "upgrade-baseline" "اتصال برقرار نشد" "" "assert-absent"
  node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/upgrade-seed.json" "فهرست برنامه‌ها" "upgrade-seed"
  # Seed QA first observes normal HOME/hidden consistency for a bounded 6s window.
  # This cold restart, not that timing window, must prove v43 durability before v44.
  # The earlier immediate-force-stop failures remain independent evidence.
  adb logcat -d > "$evidence_dir/upgrade-seed-post-background-logcat.txt"
  launch_and_verify "upgrade-baseline-relaunch" "اتصال برقرار نشد"
  node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/upgrade-baseline-check.json" "فهرست برنامه‌ها" "upgrade-baseline-check"
  node --input-type=module -e 'import {readFileSync} from "node:fs"; import {assertUpgradeBaselineEvidence} from "./scripts/android-upgrade-qa.mjs"; assertUpgradeBaselineEvidence(...process.argv.slice(1).map(path=>JSON.parse(readFileSync(path,"utf8"))));' \
    "$evidence_dir/upgrade-seed.json" "$evidence_dir/upgrade-baseline-check.json"
  adb shell am force-stop "$package_name"
  adb install -r "$stable_apk"
  launch_and_verify "upgrade-candidate" "اتصال برقرار نشد"
  node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/upgrade-check.json" "فهرست برنامه‌ها" "upgrade-check"
  capture_verified upgrade-preserved
  node --input-type=module -e 'import {readFileSync} from "node:fs"; import {assertUpgradeAppearanceEvidence} from "./scripts/android-upgrade-qa.mjs"; assertUpgradeAppearanceEvidence(...process.argv.slice(1).map(path=>JSON.parse(readFileSync(path,"utf8"))));' \
    "$evidence_dir/upgrade-seed.json" "$evidence_dir/upgrade-check.json" "$evidence_dir/upgrade-check-appearance-reset.json"
  upgrade_appearance_verified=true
  launch_and_verify "upgrade-default-light" "اتصال برقرار نشد" "assert-default-light" "restore-upgrade"
  unset upgrade_appearance_verified
  # Real UI saves on unchanged v44, after upgrade proof and before later smoke mutations.
  # Creation writes an external receipt then stops immediately (HOME case: hidden only).
  for persistence_mode in home immediate; do
    node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/ui-${persistence_mode}-create.json" "فهرست برنامه‌ها" "ui-persistence-${persistence_mode}-create"
    adb logcat -d > "$evidence_dir/ui-${persistence_mode}-post-stop-logcat.txt"
    launch_and_verify "ui-${persistence_mode}-cold" "اتصال برقرار نشد"
    node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/ui-${persistence_mode}-check.json" "فهرست برنامه‌ها" "ui-persistence-${persistence_mode}-check" "$evidence_dir/ui-${persistence_mode}-create.json"
  done
  adb shell am force-stop "$package_name"
  adb shell settings put global http_proxy :0
fi

adb install -r "$stable_apk"
if [[ "$release_inspection" == true ]]; then
  node scripts/android-release-coldcheck.mjs "$package_name" "$evidence_dir" "$api_level" "$staging_expectation"
  adb install -r -t "$test_apk"
fi
adb shell pm grant "$package_name" android.permission.POST_NOTIFICATIONS || true
adb shell appops set "$package_name" SCHEDULE_EXACT_ALARM allow || true
if [[ "$staging_expectation" == "online" ]]; then
  launch_and_verify "stable-network-enabled" "فهرست برنامه‌ها"
  if [[ "${TIA_GPT_QA_ENABLED:-false}" == true ]]; then
    [[ "$api_level" == 36 && "$release_inspection" == true ]]
    node scripts/android-public-gpt-qa.mjs "$package_name" "$evidence_dir"
  fi
else
  [[ "${TIA_GPT_QA_ENABLED:-false}" != true ]]
  launch_and_verify "stable-runner-network-recovery" "اتصال برقرار نشد"
  node scripts/android-webview-inspect.mjs \
    "$package_name" "$evidence_dir/stable-runner-local-fallback-webview.json" "فهرست برنامه‌ها" "open-offline"
  capture_verified stable-runner-local-fallback
fi

adb shell am force-stop "$package_name"
adb install -r -t "$test_apk"
adb shell am instrument -w "${package_name}.test/$runner" \
  | tee "$evidence_dir/instrumented-tests.txt"
grep -Fq "OK (" "$evidence_dir/instrumented-tests.txt"

adb shell settings put global http_proxy 127.0.0.1:9
launch_and_verify "stable-offline" "اتصال برقرار نشد"
node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/stable-local-fallback-webview.json" "فهرست برنامه‌ها" "open-offline"
capture_verified stable-local-fallback
launch_and_verify "stable-offline-relaunch" "اتصال برقرار نشد"
adb shell cmd uimode night yes
launch_and_verify "stable-os-dark-default-light" "اتصال برقرار نشد" "assert-default-light" "assert-absent"
node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/stable-dark-local-webview.json" "فهرست برنامه‌ها" "open-offline"
node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/explicit-dark-webview.json" "برنامه امروز" "appearance-dark"
capture_verified stable-dark-local
launch_and_verify "stable-dark-offline" "اتصال برقرار نشد" "assert-dark"
adb shell cmd uimode night no
launch_and_verify "stable-saved-dark-os-light" "اتصال برقرار نشد" "assert-dark"
node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/saved-dark-local-webview.json" "فهرست برنامه‌ها" "open-offline"
node scripts/android-webview-inspect.mjs "$package_name" "$evidence_dir/explicit-light-webview.json" "برنامه امروز" "appearance-light"
launch_and_verify "stable-saved-light" "اتصال برقرار نشد" "assert-light"

adb shell settings put global http_proxy :0 || true
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
if [[ "$staging_expectation" == "online" ]]; then
  launch_and_verify "stable-restored" "فهرست برنامه‌ها"
else
  launch_and_verify "stable-restored-recovery" "اتصال برقرار نشد"
  node scripts/android-webview-inspect.mjs \
    "$package_name" "$evidence_dir/stable-restored-local-webview.json" "فهرست برنامه‌ها" "open-offline"
  capture_verified stable-restored-local
fi

if [[ "$release_inspection" == true ]]; then
  node scripts/android-release-coldcheck.mjs "$package_name" "$evidence_dir/final-cold" "$api_level" "$staging_expectation"
fi

printf 'Android %s passed: real Persian UI, offline relaunch, DNS, server-down and SSL recovery.\n' "$api_level" \
  | tee "$evidence_dir/result.txt"
