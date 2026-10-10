import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/personal-android-qa.yml', 'utf8');
describe('optional official Android16 image comparison', () => {
  it('preserves the original image by default and limits the diagnostic choice', () => {
    expect(workflow).toMatch(/android_16_image:[\s\S]*?default: '36'\s+options: \['36', '36\.1'\]/);
    expect(workflow).toContain("matrix.api == 36 && inputs.android_16_image == '36.1' && '36.1'");
  });
  it('keeps production-like images, immutable signed files and the full acceptance script', () => {
    expect(workflow).toContain('target: google_apis_playstore');
    expect(workflow).toContain('node scripts/verify-personal-android.mjs');
    expect(workflow).toContain('bash scripts/android-stable-emulator-qa.sh');
    expect(workflow).not.toMatch(/continue-on-error:\s*true|adb root|writable-system/);
  });
});
