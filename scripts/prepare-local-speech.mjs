// Download only public model weights; never reads or uploads user audio.
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const root=process.cwd(), cache=path.join(root,'backups/local/speech-build');
const zip=path.resolve(process.env.TIA_MODEL_ZIP||path.join(cache,'vosk-model-small-fa-0.42.zip'));
const expected='977cb5faa538f3a835ccfd35f5f6d8284b5c450b89c700b9bd4736b66536ad46';
await mkdir(cache,{recursive:true});
try {await stat(zip);} catch {
  const response=await fetch('https://alphacephei.com/vosk/models/vosk-model-small-fa-0.42.zip',{signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw new Error('Public speech model download failed');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw new Error('Speech model digest mismatch');
  await writeFile(zip,bytes,{flag:'wx'});
}
if(createHash('sha256').update(await readFile(zip)).digest('hex')!==expected)throw new Error('Speech model digest mismatch');
// Windows ships bsdtar with ZIP support; Ubuntu's GNU tar does not read ZIP.
const windows=process.platform==='win32';
const entries=execFileSync(windows?'tar':'unzip',windows?['-tf',zip]:['-Z1',zip],{encoding:'utf8'}).trim().split(/\r?\n/);
if(entries.some(x=>!x.startsWith('vosk-model-small-fa-0.42/')||x.split('/').includes('..')||x.includes('\\')))throw new Error('Unsafe model archive');
execFileSync(windows?'tar':'unzip',windows?['-xf',zip,'-C',cache]:['-o','-q',zip,'-d',cache]);
const archive=path.join(cache,'fa-0.42.tar.gz');
execFileSync('tar',['-czf',archive,'-C',cache,'vosk-model-small-fa-0.42']);
const engine=require.resolve('vosk-browser');
// Upstream queues terminate behind inference. Abort must immediately release the
// worker (and its audio memory), including during model load. Exact pinned patch.
const engineSource=(await readFile(engine,'utf8')).replace(/\r\n/g,'\n');
const queuedTerminate='terminate() {\n            this.postMessage({\n                action: "terminate",\n            });\n            this._ready = false;\n        }';
if(engineSource.split(queuedTerminate).length!==2)throw new Error('Review Vosk cancellation patch after dependency changes');
const safeEngine=engineSource.replace(queuedTerminate,'terminate() { this.worker.terminate(); this._ready = false; }');
for(const dir of ['public/speech','mobile-shell/speech']) {
  await mkdir(path.join(root,dir),{recursive:true});
  await copyFile(archive,path.join(root,dir,'fa-0.42.tar.gz'));
  await writeFile(path.join(root,dir,'vosk-0.0.8.js'),safeEngine);
  await copyFile(path.join(root,'docs/licenses/VOSK-APACHE-2.0.txt'),path.join(root,dir,'LICENSE.txt'));
  const notice=await readFile(path.join(root,'docs/licenses/VOSK-THIRD-PARTY-NOTICE.txt'),'utf8');
  await writeFile(path.join(root,dir,'NOTICE.txt'),notice+'\n\ntia modification: engine termination patched for immediate cancellation. Persian model vosk-model-small-fa-0.42: Alpha Cephei, Apache-2.0.');
  await copyFile(path.join(root,'docs/licenses/UUID-MIT.txt'),path.join(root,dir,'UUID-MIT.txt'));
}
console.log('Verified Persian model and browser engine prepared for web and bundled Android.');
