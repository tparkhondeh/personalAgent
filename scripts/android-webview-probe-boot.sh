#!/usr/bin/env bash
# Official36.1 image: sys.boot_completed can precede the input service.
# Wait before unlocking. This is BEFORE installing any app; no failed-app retry.
set -Eeuo pipefail
[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true ]]
blank="${1:?Teardown variant required}"
[[ "$blank" == true || "$blank" == false ]]
sdk="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="$sdk/platform-tools:$sdk/emulator:$sdk/cmdline-tools/latest/bin:$PATH"
mkdir -p artifacts/probe
sdkmanager 'emulator' 'platform-tools' 'system-images;android-36.1;google_apis_playstore;x86_64'
# Dedicated name on an ephemeral runner; refuse to replace any existing AVD.
if avdmanager list avd | grep -Fq 'Name: tia_webview_probe'; then exit 1; fi
printf 'no\n' | avdmanager create avd -n tia_webview_probe -k 'system-images;android-36.1;google_apis_playstore;x86_64' --device pixel_6
emulator -avd tia_webview_probe -no-snapshot -no-window -gpu swiftshader_indirect -no-boot-anim -camera-back none -memory 4096 > artifacts/probe/emulator.log 2>&1 &
emulator_pid=$!
cleanup() {
  adb logcat -d > artifacts/probe/boot-and-app-logcat.txt 2>/dev/null || true
  adb emu kill >/dev/null 2>&1 || true
  wait "$emulator_pid" || true
}
trap cleanup EXIT
timeout 180s adb wait-for-device
ready=0
for attempt in $(seq 1 90); do
  boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  input="$(adb shell service check input 2>/dev/null | tr -d '\r' || true)"
  window="$(adb shell service check window 2>/dev/null | tr -d '\r' || true)"
  printf 'attempt=%s boot=%s input=%s window=%s\n' "$attempt" "$boot" "$input" "$window" >> artifacts/probe/services.txt
  if [[ "$boot" == 1 && "$input" == 'Service input: found' && "$window" == 'Service window: found' ]]; then
    ready=$((ready + 1))
    if (( ready >= 3 )); then break; fi
  else ready=0; fi
  sleep 2
done
(( ready >= 3 ))
adb shell input keyevent 82
bash scripts/android-emulator-settle.sh artifacts/probe/prepare
bash scripts/android-webview-probe.sh "$blank"
