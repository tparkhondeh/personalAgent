#!/usr/bin/env bash
# CI-only: let a fresh emulator finish initial GMS module updates before testing.
# Never disable/update packages, bypass TLS, or restart a failed application here.
set -Eeuo pipefail
evidence="${1:?Evidence directory required}"
mkdir -p "$evidence"
adb wait-for-device
adb logcat -c
elapsed=0
stable=0
previous=""
while (( elapsed < 600 )); do
  boot="$(adb shell getprop sys.boot_completed | tr -d '\r')"
  pid="$(adb shell pidof com.google.android.gms.persistent | tr -d '\r')"
  printf '%s boot=%s gms=%s\n' "$elapsed" "$boot" "$pid" >> "$evidence/emulator-settle.txt"
  if [[ "$boot" == 1 && -n "$pid" && "$pid" == "$previous" ]]; then
    stable=$((stable + 10))
  else
    stable=0
  fi
  # A stable PID immediately after boot does not mean initial module downloads
  # have completed. Require a minimum five-minute warm-up AND two stable minutes.
  if (( elapsed >= 300 && stable >= 120 )); then
    adb logcat -d > "$evidence/emulator-settle-logcat.txt"
    adb shell dumpsys webviewupdate > "$evidence/webview-provider.txt"
    exit 0
  fi
  previous="$pid"
  sleep 10
  elapsed=$((elapsed + 10))
done
adb logcat -d > "$evidence/emulator-settle-logcat.txt"
echo 'Emulator services did not settle; APK tests and publication are blocked.' >&2
exit 1
