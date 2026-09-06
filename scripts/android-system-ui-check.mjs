import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function systemDialog(xml) {
  if (!xml.includes('<hierarchy')||!xml.includes('</hierarchy>')) throw new Error('Missing Android UI hierarchy');
  xml=xml.replaceAll('&apos;',"'").replaceAll('&#39;',"'");
  const blocked = /resource-id="android:id\/aerr_|text="[^"]*(?:isn.t responding|keeps stopping|has stopped)/i.test(xml);
  const waitNode = [...xml.matchAll(/<node\s[^>]+/g)].map(m=>m[0]).find(n=>/text="Wait"/.test(n));
  const bounds = waitNode?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  return { blocked, launcher:blocked&&/text="Pixel Launcher isn.t responding"/.test(xml), wait:bounds?[Math.round((+bounds[1]+ +bounds[3])/2),Math.round((+bounds[2]+ +bounds[4])/2)]:null };
}

async function main() {
  const [prefix,mode]=process.argv.slice(2);
  if(!prefix)throw new Error('Evidence prefix required');
  mkdirSync(dirname(prefix),{recursive:true});
  const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:45000});
  const inspect=(suffix)=>{
    adb('shell','uiautomator','dump','/sdcard/hamrah-qa-window.xml');
    const xml=adb('exec-out','cat','/sdcard/hamrah-qa-window.xml');
    writeFileSync(`${prefix}-${suffix}.xml`,xml);
    const window=adb('shell','dumpsys','window','windows');
    writeFileSync(`${prefix}-${suffix}-window.txt`,window);
    return systemDialog(xml);
  };
  let state=inspect('before');let waited=false;
  // Before app installation only: use the visible system Wait button once.
  // Keep the initial ANR evidence; never disable Launcher or dismiss app errors.
  if(mode==='settle-launcher'&&state.launcher&&state.wait){
    writeFileSync(`${prefix}-launcher-anr.png`,execFileSync('adb',['exec-out','screencap','-p']));
    adb('shell','input','tap',...state.wait.map(String));waited=true;
    await new Promise(r=>setTimeout(r,10000));state=inspect('after-wait');
  }
  writeFileSync(`${prefix}-result.json`,JSON.stringify({clear:!state.blocked,preInstallLauncherWait:waited}));
  if(state.blocked)throw new Error('System Crash/ANR dialog obscures the app; visual QA and release blocked');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
