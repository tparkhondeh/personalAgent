// Verify actual APK bytes before emulator startup; AAPT can rename .gz assets.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const apk=process.argv[2];if(!apk?.endsWith('.apk'))throw Error('APK path required');
const expected=readFileSync('mobile-shell/speech/fa-0.42.model');
const entry='assets/public/speech/fa-0.42.model';
const actual=execFileSync(process.platform==='win32'?'tar':'unzip',process.platform==='win32'?['-xOf',apk,entry]:['-p',apk,entry],{maxBuffer:100*1024*1024});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(actual[0]!==0x1f||actual[1]!==0x8b||hash(actual)!==hash(expected))throw Error('APK speech model bytes differ from verified prepared model');
console.log(JSON.stringify({speechAssetVerified:true,bytes:actual.length,sha256:hash(actual)}));
