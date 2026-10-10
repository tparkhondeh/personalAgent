import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('native failure evidence is not acceptance', () => {
  it('keeps the original failure terminal regardless of diagnostic outcome', () => {
    const source = readFileSync('scripts/android-stable-emulator-qa.sh', 'utf8');
    expect(source).toContain('|| ! grep -Fq "OK (" "$evidence_dir/instrumented-tests.txt"');
    expect(source).toContain('"$evidence_dir" || true\n  exit 1\nfi');
  });
  it('is limited to disposable CI emulators and preserves data and network settings', () => {
    const source = readFileSync('scripts/android-native-failure-diagnostic.sh', 'utf8');
    expect(source).toContain('"${CI:-}" == true');
    expect(source).toContain('getprop ro.kernel.qemu');
    expect(source).toContain('trap restore_proxy EXIT');
    expect(source).toContain('timeout 90s');
    expect(source).not.toMatch(/adb.*(?:uninstall|pm clear|install -|logcat -c)/);
  });
});
