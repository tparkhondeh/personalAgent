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

it('requires completed shell capture and the exact accessibility callback stack when VM teardown is not logged',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {inspectLogcat} from './scripts/android-logcat-check.mjs';
    const row=(text,pid=7647,tag='AndroidRuntime')=>'09-15 11:43:11.451  '+pid+'  7659 E '+tag+': '+text;
    // Minimal synthetic transcript of the independently captured Android16
    // shell process. No app/user log data is committed.
    const rows=[
      row('>>>>>> START com.android.internal.os.RuntimeInit uid 2000 <<<<<<'),
      row('Calling main entry com.android.commands.uiautomator.Launcher'),
      row('Fetch time: 15ms',7647,'AccessibilityNodeInfoDumper'),
      row('FATAL EXCEPTION: UiAutomation'),
      row('java.lang.RuntimeException: Bad file descriptor'),
      row('at android.os.BinderProxy.transactNative(Native Method)'),
      row('at android.view.accessibility.AccessibilityCache.onAccessibilityEvent(AccessibilityCache.java:309)')
    ];
    const transcript=rows.join('\\n');
    assert.equal(inspectLogcat(transcript).clear,true);
    assert.equal(inspectLogcat(transcript).observationFailures.length,1);
    for(const index of [0,1,2,4,5,6]){
      assert.equal(inspectLogcat(rows.filter((_,i)=>i!==index).join('\\n')).clear,false,'missing evidence '+index);
    }
    assert.equal(inspectLogcat(transcript.replace('uid 2000','uid 10111')).clear,false);
    assert.equal(inspectLogcat(transcript.replace('7647  7659 E AccessibilityNodeInfoDumper','9999  7659 E AccessibilityNodeInfoDumper')).clear,false);
    assert.equal(inspectLogcat(transcript.replace('AccessibilityNodeInfoDumper: Fetch','Other: Fetch')).clear,false);
    assert.equal(inspectLogcat(transcript+'\\n'+row('Process: ir.wealthos.personalagent.stable42, PID: 7647')).clear,false);
    assert.equal(inspectLogcat(rows.filter((_,i)=>i!==2).concat(rows[2]).join('\\n')).clear,false,'later dump does not prove earlier completion');
    for(const text of ['FATAL EXCEPTION: main','Fatal signal 11','SIGSEGV','Uncaught TypeError: x','SSL handler proceed']){
      assert.equal(inspectLogcat(transcript+'\\n'+row(text,9000)).clear,false);
    }
  `]);
});
