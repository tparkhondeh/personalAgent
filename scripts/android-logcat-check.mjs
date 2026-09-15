import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep the complete log. Only a proven shell UIAutomator observation exception
// is classified separately; app/renderer/unknown errors still fail. Android16
// can deliver a final accessibility callback after a completed dump, before the
// optional "Shutting down VM" line. Require the completed dump AND exact stack
// for that variant; the CLI additionally requires a fresh unobscured hierarchy.
export function inspectLogcat(log) {
  const lines=log.split(/\r?\n/);
  const parsed=lines.map((line,index)=>{
    const m=line.match(/^\d\d-\d\d\s+\S+\s+(\d+)\s+\d+\s+[VDIWEF]\s+([^:]+):\s*(.*)$/);
    return {line,index,pid:m?.[1],tag:m?.[2].trim(),message:m?.[3]??''};
  });
  const failures=[];const observationFailures=[];
  for(const entry of parsed){
    if(!/FATAL EXCEPTION|Fatal signal|SIGSEGV|Uncaught (TypeError|ReferenceError|SyntaxError)|SSL.*proceed/.test(entry.line))continue;
    const own=parsed.filter(row=>row.pid&&row.pid===entry.pid);
    const runtime=own.filter(row=>row.tag==='AndroidRuntime');
    const completedDumpCallback=own.some(row=>row.index<entry.index&&row.tag==='AccessibilityNodeInfoDumper'&&/^Fetch time: \d+ms$/.test(row.message))
      &&runtime.some(row=>/^at android\.os\.BinderProxy\.transactNative\(Native Method\)$/.test(row.message.trim()))
      &&runtime.some(row=>/^at android\.view\.accessibility\.AccessibilityCache\.onAccessibilityEvent\(AccessibilityCache\.java:\d+\)$/.test(row.message.trim()));
    const knownTeardown=entry.pid&&entry.tag==='AndroidRuntime'&&entry.message==='FATAL EXCEPTION: UiAutomation'
      &&runtime.some(row=>row.index<entry.index&&row.message==='>>>>>> START com.android.internal.os.RuntimeInit uid 2000 <<<<<<')
      &&runtime.some(row=>row.index<entry.index&&row.message==='Calling main entry com.android.commands.uiautomator.Launcher')
      &&(runtime.some(row=>row.message==='Shutting down VM')||completedDumpCallback)
      &&runtime.some(row=>row.message==='java.lang.RuntimeException: Bad file descriptor')
      &&!own.some(row=>/^Process:/.test(row.message));
    if(knownTeardown)observationFailures.push({pid:entry.pid,reason:completedDumpCallback?'Verified shell UIAutomator accessibility callback after completed dump':'Verified shell UIAutomator Bad file descriptor during teardown',line:entry.line});
    else failures.push(entry.line);
  }
  return {clear:failures.length===0,failures,observationFailures};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [logPath,uiPath,outputPath]=process.argv.slice(2);
  const ui=JSON.parse(readFileSync(uiPath,'utf8'));
  if(ui.clear!==true||ui.blockedBy!==null)throw Error('Fresh verified system UI is required before log classification');
  const result=inspectLogcat(readFileSync(logPath,'utf8'));
  writeFileSync(outputPath,JSON.stringify(result,null,2));
  if(!result.clear)throw Error('Android/JavaScript/renderer/unsafe SSL failure: '+result.failures.join('\n'));
  console.log(`Log verified; ${result.observationFailures.length} separately recorded UIAutomator teardown exception(s).`);
}
