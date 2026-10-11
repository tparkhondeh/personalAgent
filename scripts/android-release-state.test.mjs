import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {classifyReleaseUi} from './android-release-state.mjs';

describe('exact release launch with a changing public network', () => {
  it('recognizes a real task screen separately from actionable recovery', () => {
    expect(classifyReleaseUi('فهرست برنامه‌ها')).toBe('online');
    expect(classifyReleaseUi('اتصال برقرار نشد تلاش دوباره ادامه در حالت محلی')).toBe('recovery');
  });
  it('does not accept blank, loading, incomplete or ambiguous screens', () => {
    for (const text of ['', 'در حال آماده‌سازی tia…', 'اتصال برقرار نشد', 'اتصال برقرار نشد تلاش دوباره', 'فهرست برنامه‌ها اتصال برقرار نشد تلاش دوباره ادامه در حالت محلی']) {
      expect(classifyReleaseUi(text)).toBeNull();
    }
  });
  it('retains native crash, system overlay, debug and connected-GPT gates', () => {
    const cold = readFileSync('scripts/android-release-coldcheck.mjs', 'utf8');
    expect(cold).toContain('assert(!systemDialog(xml).blocked');
    expect(cold).toContain('android-logcat-check.mjs');
    expect(cold).toContain('Cold release must not expose WebView debugging');
    expect(cold).toContain('connectedAcceptance: actual === "online"');
    const suite = readFileSync('scripts/android-stable-emulator-qa.sh', 'utf8');
    expect(suite).toContain('staging_expectation="$(node');
    expect(suite).toContain('[[ "${TIA_GPT_QA_ENABLED:-false}" != true ]]');
    expect(suite).toContain('instrumented-tests.txt');
  });
});
