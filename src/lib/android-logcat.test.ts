import { it } from 'vitest';
import { execFileSync } from 'node:child_process';

it('separates proven shell capture teardown without masking app, renderer or unknown crashes',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {inspectLogcat} from './scripts/android-logcat-check.mjs';
    const row=(text,pid=7371)=>'09-06 10:14:15.182  '+pid+'  7384 E AndroidRuntime: '+text;
    const proven=[
      '>>>>>> START com.android.internal.os.RuntimeInit uid 2000 <<<<<<',
      'Calling main entry com.android.commands.uiautomator.Launcher',
      'Shutting down VM','FATAL EXCEPTION: UiAutomation',
      'java.lang.RuntimeException: Bad file descriptor'
    ].map(text=>row(text)).join('\\n');
    assert.equal(inspectLogcat(proven).observationFailures.length,1);
    assert.equal(inspectLogcat(proven).clear,true);
    for(const text of ['FATAL EXCEPTION: main','Fatal signal 11','SIGSEGV','Uncaught TypeError: x','SSL handler proceed']){
      assert.equal(inspectLogcat(proven+'\\n'+row(text,9000)).clear,false);
    }
    assert.equal(inspectLogcat(row('FATAL EXCEPTION: UiAutomation')).clear,false);
    assert.equal(inspectLogcat(proven.replace('uid 2000','uid 10111')).clear,false);
    assert.equal(inspectLogcat(proven+'\\n'+row('Process: ir.wealthos.personalagent.stable28, PID: 7371')).clear,false);
    assert.equal(inspectLogcat(proven.replace('7371  7384 E AndroidRuntime: FATAL','9000  7384 E AndroidRuntime: FATAL')).clear,false);
    assert.equal(inspectLogcat(proven.replace('Bad file descriptor','App failed')).clear,false);
  `]);
});
