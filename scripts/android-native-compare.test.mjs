import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const script = readFileSync(new URL('./android-native-compare.sh', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/android-native-compare.yml', import.meta.url), 'utf8');
describe('isolated Android16 comparison safeguards', () => {
  it('requires a disposable fresh API36 emulator and never erases installation data', () => {
    for (const marker of ['ro.kernel.qemu', 'ro.build.version.sdk', '== 36', 'pm path', 'exit 1']) expect(script).toContain(marker);
    expect(script).not.toMatch(/adb (uninstall|shell pm clear)|logcat -c|install -[rd]/);
    expect(script).toContain('timeout 90s');
    expect(script).toContain("grep -Fq 'OK (1 test)'");
    expect(script).toContain('exit "$failed"');
  });
  it('keeps two fixed production identities and never funds GPT or publishes results as a release', () => {
    expect(workflow).toContain('variant: [baseline44, candidate45]');
    expect(workflow).toContain('fa62f5b0f9e55270fc78f01dc16441162a7ba0e13337a81d8c24d2fcbfbfa377');
    expect(workflow).toContain('67c010c02f194adc9b90ecec6195720bef2da3612d287c51e3ce87333bd859c3');
    expect(workflow).not.toMatch(/contents: write|OPENAI_API_KEY|TIA_GPT_QA_FIXTURE|gh release create/);
  });
});
