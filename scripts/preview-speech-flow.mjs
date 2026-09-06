// Local browser harness for the exact bundled UI and the emulator speech test.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {persianSpeechFixtureQa} from './android-persian-speech-qa.mjs';
import {waitUntil} from './qa-wait-until.mjs';
const base64=(await readFile('tests/fixtures/fa-welcome.wav')).toString('base64');
const script=`<aside style="position:fixed;bottom:95px;left:12px;z-index:100;background:white;border:1px solid #666;padding:8px;font:14px sans-serif"><button id="qa-run">آزمون مسیر صوت فارسی</button><output id="qa-result"></output></aside><script>document.querySelector('#qa-run').onclick=async()=>{const status=document.querySelector('#qa-result');status.textContent='در حال آزمایش';try{const r=await (${persianSpeechFixtureQa.toString()})(${JSON.stringify(base64)},${waitUntil.toString()});status.textContent=JSON.stringify(r);}catch(e){status.textContent='خطا: '+e.message;}};</script>`;
const files=new Set(['app.css','theme.css','appearance.js','voice-capture.js','app.js','domain.js','planner.js','input-controls.js','content.js','Vazirmatn.woff2','speech/vosk-0.0.8.js','speech/fa-0.42.tar.gz']);
const mime={js:'application/javascript',css:'text/css',woff2:'font/woff2',gz:'application/gzip'};
createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);try{if(!name){const html=(await readFile('mobile-shell/index.html','utf8')).replace('</body>',script+'</body>');res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'}).end(html);}else if(files.has(name)){res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)]}).end(await readFile('mobile-shell/'+name));}else res.writeHead(404).end();}catch{res.writeHead(500).end();}}).listen(3014,'127.0.0.1',()=>console.log('Speech flow QA http://localhost:3014'));
