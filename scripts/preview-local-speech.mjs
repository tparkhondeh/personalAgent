// Local-only real-engine test UI. Never included in the application or APK.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile('src/lib/local-speech.ts','utf8');
const js=ts.transpileModule(source.replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
const html=`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>آزمون واقعی تبدیل فارسی tia</title><body style="font:18px sans-serif;padding:24px;background:#f7f7ff;color:#303448"><h1>آزمون واقعی تبدیل فارسی tia</h1><button id="run">تبدیل نمونه فارسی</button><button id="cancel">لغو</button><pre id="status" style="white-space:pre-wrap"></pre><script>${js}
const engine=createLocalSpeech(),status=document.querySelector('#status');let version=0;
document.querySelector('#cancel').onclick=()=>{version++;engine.cancel();status.textContent='لغو شد';};
document.querySelector('#run').onclick=async()=>{const current=++version;status.textContent='شروع';try{const audio=await fetch('/sample.wav').then(r=>r.blob());const text=await engine.transcribe(audio,m=>{if(current===version)status.textContent=m;});if(current===version)status.textContent='متن واقعی: '+text;}catch(e){if(current===version)status.textContent=e.message;}};
</script></body></html>`;
createServer(async(req,res)=>{const files={'/speech/vosk-0.0.8.js':['public/speech/vosk-0.0.8.js','application/javascript'],'/speech/fa-0.42.tar.gz':['public/speech/fa-0.42.tar.gz','application/gzip'],'/sample.wav':['tests/fixtures/fa-welcome.wav','audio/wav']};if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'}).end(html);return;}const file=files[req.url];if(!file){res.writeHead(404).end();return;}try{res.writeHead(200,{'Content-Type':file[1]}).end(await readFile(file[0]));}catch{res.writeHead(404).end();}}).listen(3013,'127.0.0.1',()=>console.log('Speech QA http://localhost:3013'));
