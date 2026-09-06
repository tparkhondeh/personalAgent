import { it } from 'vitest';
import { execFileSync } from 'node:child_process';

it('waits for native deletion before taking the no-side-effects baseline',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {waitUntil} from './scripts/qa-wait-until.mjs';
    let checks=0;let records=[{id:'previous-confirmed-task'}];
    await waitUntil(()=>{checks++;if(checks===3)records=[];return records.length===0;},'Removal incomplete',{attempts:4,delayMs:1});
    assert.equal(checks,3);assert.deepEqual(records,[]);
    await assert.rejects(waitUntil(()=>false,'Removal incomplete',{attempts:2,delayMs:1}),/Removal incomplete/);
    await assert.rejects(waitUntil(()=>{throw Error('Bridge failed');},'ignored'),/Bridge failed/);
  `]);
});
