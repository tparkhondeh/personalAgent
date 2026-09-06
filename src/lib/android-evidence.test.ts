import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

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
