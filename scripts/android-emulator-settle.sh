#!/usr/bin/env bash
# CI-only: let a fresh emulator finish initial GMS module updates before testing.
# Never disable/update packages, bypass TLS, or restart a failed application here.
# One full emulator reboot is permitted BEFORE installing Hamrah, only after a
# recorded Launcher ANR. Both boot attempts remain evidence; app QA never retries.
set -Eeuo pipefail
evidence="${1:?Evidence directory required}"
mkdir -p "$evidence"
adb wait-for-device
if adb shell pm list packages ir.wealthos.personalagent | grep -q 'package:ir.wealthos.personalagent'; then
  echo 'Pre-install warm-up cannot run after Hamrah installation.' >&2
  exit 1
fi
for boot_attempt in 1 2; do
adb logcat -c
elapsed=0
stable=0
previous=""
while (( elapsed < 600 )); do
  boot="$(adb shell getprop sys.boot_completed | tr -d '\r')"
  pid="$(adb shell pidof com.google.android.gms.persistent | tr -d '\r' || true)"
  printf 'attempt=%s elapsed=%s boot=%s gms=%s\n' "$boot_attempt" "$elapsed" "$boot" "$pid" >> "$evidence/emulator-settle.txt"
  if [[ "$boot" == 1 && -n "$pid" && "$pid" == "$previous" ]]; then
    stable=$((stable + 10))
  else
    stable=0
  fi
  # A stable PID immediately after boot does not mean initial module downloads
  # have completed. Require a minimum five-minute warm-up AND two stable minutes.
  if (( elapsed >= 300 && stable >= 120 )); then
    adb logcat -d > "$evidence/boot-${boot_attempt}-settle-logcat.txt"
    adb shell dumpsys webviewupdate > "$evidence/boot-${boot_attempt}-webview-provider.txt"
    prefix="$evidence/pre-install-boot-${boot_attempt}-system-ui"
    if node scripts/android-system-ui-check.mjs "$prefix" settle-launcher; then
      exit 0
    fi
    # A missing/invalid dump or any non-Launcher error still fails closed.
    if [[ "$boot_attempt" == 1 ]] && node --input-type=module - "$prefix-result.json" <<'NODE'
import {readFileSync} from 'node:fs';
const state=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(state.blockedBy!=='launcher')process.exit(1);
NODE
    then
      adb logcat -d > "$evidence/boot-1-before-reboot-logcat.txt"
      printf 'One pre-install reboot after recorded Launcher ANR\n' >> "$evidence/emulator-settle.txt"
      adb reboot
      sleep 5
      adb wait-for-device
      break
    fi
    exit 1
  fi
  previous="$pid"
  sleep 10
  elapsed=$((elapsed + 10))
done
if (( elapsed >= 600 )); then break; fi
done
adb logcat -d > "$evidence/settle-failure-logcat.txt"
echo 'Emulator services did not settle; APK tests and publication are blocked.' >&2
exit 1
