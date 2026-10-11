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
# setup-java / SDK tools can resolve different default Android user directories.
# Give avdmanager and emulator the same explicit, disposable AVD root.
probe_avd_root="${RUNNER_TEMP:?Disposable runner required}/tia-webview-probe-avd"
[[ ! -e "$probe_avd_root" ]]
mkdir -p "$probe_avd_root"
export ANDROID_AVD_HOME="$probe_avd_root"
# Dedicated name on an ephemeral runner; refuse to replace any existing AVD.
if avdmanager list avd | grep -Fq 'Name: tia_webview_probe'; then exit 1; fi
printf 'no\n' | avdmanager create avd -n tia_webview_probe -k 'system-images;android-36.1;google_apis_playstore;x86_64' --device pixel_6 --path "$probe_avd_root/tia_webview_probe.avd"
[[ -f "$probe_avd_root/tia_webview_probe.ini" ]]
emulator -list-avds | grep -Fxq 'tia_webview_probe'
emulator -avd tia_webview_probe -no-snapshot -no-window -gpu swiftshader_indirect -no-boot-anim -camera-back none -memory 4096 > artifacts/probe/emulator.log 2>&1 &
emulator_pid=$!
cleanup() {
  timeout 10s adb logcat -d > artifacts/probe/boot-and-app-logcat.txt 2>/dev/null || true
  timeout 10s adb emu kill >/dev/null 2>&1 || true
  # Only the child emulator created above, in this disposable CI job.
  if kill -0 "$emulator_pid" 2>/dev/null; then kill -TERM "$emulator_pid" 2>/dev/null || true; fi
  for attempt in $(seq 1 10); do
    kill -0 "$emulator_pid" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$emulator_pid" 2>/dev/null; then kill -KILL "$emulator_pid" 2>/dev/null || true; fi
  wait "$emulator_pid" || true
}
trap cleanup EXIT
timeout 180s adb wait-for-device
ready=0
deadline=$((SECONDS + 180))
for attempt in $(seq 1 90); do
  (( SECONDS < deadline )) || break
  boot="$(timeout 8s adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  input="$(timeout 8s adb shell service check input 2>/dev/null | tr -d '\r' || true)"
  window="$(timeout 8s adb shell service check window 2>/dev/null | tr -d '\r' || true)"
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
