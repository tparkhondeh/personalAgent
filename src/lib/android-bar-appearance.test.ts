import { it } from 'vitest';
import { execFileSync } from 'node:child_process';

it('rejects unreadable native bars and checks only the exact app window',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {verifyBarAppearance} from './scripts/android-bar-appearance.mjs';
    const name='ir.wealthos.personalagent.stable29';
    const window=(pkg,flags)=>'\\n  Window #8 Window{u0 '+pkg+'/ir.wealthos.personalagent.MainActivity}:\\n mOwnerUid=1 package='+pkg+' appop=NONE\\n mAttrs={ty=BASE_APPLICATION\\n apr='+flags+'}\\n Requested w=1080 h=2400';
    const light=window(name,'LIGHT_STATUS_BARS LIGHT_NAVIGATION_BARS'),dark=window(name,'');
    assert(verifyBarAppearance(light,name,'light').verified);
    assert(verifyBarAppearance(dark,name,'dark').verified);
    assert.throws(()=>verifyBarAppearance(light,name,'dark'),/contrast mismatch/);
    assert.throws(()=>verifyBarAppearance(dark,name,'light'),/contrast mismatch/);
    assert.throws(()=>verifyBarAppearance(window(name+'.other',''),name,'dark'),/Missing main/);
    assert.throws(()=>verifyBarAppearance('',name,'dark'),/Missing main/);
    assert(verifyBarAppearance(window('com.other','LIGHT_STATUS_BARS')+dark,name,'dark').verified);
  `]);
});
