import { it } from 'vitest';
import { execFileSync } from 'node:child_process';

it('retries only a killed capture, never hides an ANR or reuses stale XML',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {captureHierarchy,systemDialog} from './scripts/android-system-ui-check.mjs';
    const clean='<hierarchy><node text="همراه"/></hierarchy>';
    const anr='<hierarchy><node resource-id="android:id/aerr_close" text="همراه"/></hierarchy>';
    let dumps=0;let paths=[];let recorded=[];
    const killed=()=>Object.assign(Error('Capture killed'),{status:137,stdout:'dump complete'});
    const actual=await captureHierarchy((...args)=>{if(args[0]==='shell'){paths.push(args[3]);if(++dumps===1)throw killed();return '';}return clean;},e=>recorded.push(e),'test');
    assert.equal(actual,clean);assert.equal(dumps,2);assert.equal(new Set(paths).size,2);assert.equal(recorded[0].status,137);
    dumps=0;
    const blocked=await captureHierarchy((...args)=>{if(args[0]==='shell'){dumps++;throw killed();}return anr;},()=>{},'anr');
    assert(systemDialog(blocked).blocked);assert.equal(dumps,1);
    await assert.rejects(captureHierarchy((...args)=>args[0]==='shell'?'':'broken dump',()=>{},'invalid'),/Missing Android/);
    await assert.rejects(captureHierarchy(()=>{throw Object.assign(Error('Transport failed'),{status:1});},()=>{},'transport'),/Transport failed/);
    dumps=0;
    await assert.rejects(captureHierarchy((...args)=>{if(args[0]==='shell'){dumps++;throw killed();}throw Error('Missing file');},()=>{},'missing'),/Capture killed/);
    assert.equal(dumps,3);
  `]);
});
