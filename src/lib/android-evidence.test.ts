import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

it('requires emulator readiness and real UI evidence in routine Android CI', () => {
  const workflow = readFileSync('.github/workflows/android.yml', 'utf8');
  const smoke = readFileSync('scripts/android-emulator-smoke.sh', 'utf8');
  expect(workflow).toMatch(/android-emulator-settle\.sh artifacts\/android\/settle &&\s+bash scripts\/android-emulator-smoke\.sh/);
  expect(smoke).toContain(':app:connectedDebugAndroidTest');
  expect(smoke).toContain('cold-launch-webview.json" "فهرست برنامه‌ها"');
  const stable = readFileSync('scripts/android-stable-emulator-qa.sh', 'utf8');
  expect(stable).not.toContain('"برنامه امروز" "open-offline"');
  expect(stable).toContain('"فهرست برنامه‌ها" "open-offline"');
  expect(smoke).toContain('cold-launch-system-ui" inspect');
  expect(smoke).toContain('node scripts/android-logcat-check.mjs');
  expect(smoke.indexOf('pre-install-logcat.txt')).toBeLessThan(smoke.indexOf('adb logcat -c'));
  expect(smoke.indexOf('adb logcat -c')).toBeLessThan(smoke.indexOf('adb install -r'));
  // Clearing/retrying after an app failure would hide the exact regression.
  expect(smoke.slice(smoke.indexOf('adb install -r'))).not.toContain('adb logcat -c');
});

it('keeps cross-version screenshots unique and marks system failures as diagnostics',()=>{
  expect(()=>execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {evidenceName} from './scripts/prepare-android-release-evidence.mjs';
    assert.equal(evidenceName('artifacts/evidence/android-evidence-34-123/stable-keyboard.png'),'api-34-stable-keyboard.png');
    assert.equal(evidenceName('artifacts/evidence/retest-android-33-456/stable-keyboard.png'),'api-33-stable-keyboard.png');
    assert.equal(evidenceName('artifacts/evidence/android-36/pre-install-system-ui-launcher-anr.png'),'diagnostic-api-36-pre-install-system-ui-launcher-anr.png');
    assert.throws(()=>evidenceName('artifacts/evidence/unknown/stable.png'));
    assert.throws(()=>evidenceName('artifacts/evidence/android-36/invalid file.png'));
  `])).not.toThrow();
});
