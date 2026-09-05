#!/usr/bin/env bash

set -Eeuo pipefail

evidence_dir="artifacts/phone-preview/emulator"
apk_path="public/downloads/hamrah-phone-preview.apk"

mkdir -p "$evidence_dir"

collect_evidence() {
  adb shell dumpsys activity activities > "$evidence_dir/activity.txt" 2>&1 || true
  adb shell uiautomator dump /sdcard/hamrah-preview-window.xml > "$evidence_dir/uiautomator-command.txt" 2>&1 || true
  adb pull /sdcard/hamrah-preview-window.xml "$evidence_dir/window.xml" > /dev/null 2>&1 || true
  adb exec-out screencap -p > "$evidence_dir/screen.png" 2>/dev/null || true
  adb logcat -d > "$evidence_dir/logcat.txt" 2>&1 || true
}

trap collect_evidence EXIT

adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb install -r "$apk_path"
activity_name="$(adb shell cmd package resolve-activity --brief "$PREVIEW_PACKAGE_ID" | tr -d '\r' | tail -n 1)"
if [[ "$activity_name" != "$PREVIEW_PACKAGE_ID/"* ]]; then
  echo "Android could not resolve the preview launcher activity: $activity_name" >&2
  exit 1
fi
adb logcat -c
adb shell am force-stop "$PREVIEW_PACKAGE_ID"
adb shell am start -W -n "$activity_name" | tee "$evidence_dir/activity-start.txt"
grep -Fq 'Status: ok' "$evidence_dir/activity-start.txt"

sleep 20
collect_evidence

process_id="$(adb shell pidof "$PREVIEW_PACKAGE_ID" | tr -d '\r')"
if [[ -z "$process_id" ]]; then
  echo 'The Android preview process stopped after launch.' >&2
  exit 1
fi

if grep -Eq 'ERR_NAME_NOT_RESOLVED|net::ERR_|FATAL EXCEPTION|Uncaught (TypeError|ReferenceError)' "$evidence_dir/logcat.txt"; then
  echo 'The connected Android preview logged a fatal rendering or network error.' >&2
  exit 1
fi

SCREENSHOT_PATH="$evidence_dir/screen.png" SCREEN_STATS_PATH="$evidence_dir/screen-stats.json" node <<'NODE'
const sharp = require("sharp");

async function main() {
  const screenshotPath = process.env.SCREENSHOT_PATH;
  const statsPath = process.env.SCREEN_STATS_PATH;
  const image = sharp(screenshotPath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("The emulator screenshot has no dimensions.");
  }

  const left = Math.round(metadata.width * 0.03);
  const top = Math.round(metadata.height * 0.08);
  const width = metadata.width - (left * 2);
  const height = Math.round(metadata.height * 0.82);
  const stats = await image.extract({ left, top, width, height }).removeAlpha().stats();
  const averageDeviation = stats.channels.slice(0, 3)
    .reduce((total, channel) => total + channel.stdev, 0) / 3;
  const result = {
    width: metadata.width,
    height: metadata.height,
    averageDeviation: Number(averageDeviation.toFixed(3)),
    rendered: averageDeviation >= 3,
  };

  require("node:fs").writeFileSync(statsPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  if (!result.rendered) {
    throw new Error("The Android WebView screenshot is blank or visually empty.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "Hamrah preview rendered successfully with process $process_id on Android 16."
