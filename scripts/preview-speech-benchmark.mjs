// Isolated UI benchmark, public fixtures only, loopback only. No user data.
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {speechErrors,editDistance,normalizePersianTranscript} from './speech-metrics.mjs';
import ts from 'typescript';
const root='artifacts/speech-poems/benchmark';
const baseline=process.env.SPEECH_BASELINE_PATH;
const manifest=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){
  const variant=url.searchParams.get('variant')==='before'?'before':'after';
  if(variant==='before'&&!baseline)throw new Error('Set SPEECH_BASELINE_PATH to the preserved pre-change source');
  const source=await readFile(variant==='before'?baseline:'src/lib/local-speech.ts','utf8');
  const js=ts.transpileModule(source.replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
  const html=`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>سنجش فارسی tia — ${variant}</title><style>body{font:16px Tahoma;background:#f7f7ff;color:#303448;padding:24px}button{padding:12px}pre{white-space:pre-wrap}</style><h1>سنجش صدای عمومی فارسی — ${variant}</h1><button id="run">شروع سنجش</button><button id="cancel">لغو</button><pre id="result">۲۰ نمونه ثابت؛ بدون صدای شخصی</pre><script>${js}\n${normalizePersianTranscript.toString()}\n${editDistance.toString()}\n${speechErrors.toString()}
  const manifest=${JSON.stringify(manifest)},engine=createLocalSpeech(),output=document.querySelector('#result');let cancelled=false;
  document.querySelector('#cancel').onclick=()=>{cancelled=true;engine.cancel();};
  document.querySelector('#run').onclick=async()=>{document.querySelector('#run').disabled=true;const results=[];try{for(const sample of manifest.samples){if(cancelled)break;output.textContent='در حال سنجش '+sample.id;const audio=await fetch('/audio/'+sample.file).then(r=>r.blob());const started=performance.now();let phase=started,loadingMs=null;try{const text=await engine.transcribe(audio,m=>{if(m.includes('در حال آماده'))phase=performance.now();if(m.includes('در حال تبدیل'))loadingMs=performance.now()-phase;});results.push({id:sample.id,reference:sample.text,text,elapsedMs:performance.now()-started,loadingMs,...speechErrors(sample.text,text)});}catch(e){results.push({id:sample.id,error:e.message,elapsedMs:performance.now()-started});}output.textContent=JSON.stringify(results.slice(-1),null,2);}engine.cancel();const report={variant:'${variant}',userAgent:navigator.userAgent,cancelled,results};await fetch('/results/${variant}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});output.textContent=JSON.stringify(report,null,2);}catch(e){output.textContent=e.message;}finally{document.querySelector('#run').disabled=false;}};
  </script></html>`;
  res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'}).end(html);return;
 }
 if(req.method==='POST'&&/^\/results\/(before|after)$/.test(url.pathname)){
  let body='';for await(const chunk of req){body+=chunk;if(body.length>150000)throw new Error('Result too large');}const report=JSON.parse(body);if(report.results?.some(r=>!manifest.samples.some(s=>s.id===r.id)))throw new Error('Unexpected fixture');const file=`${root}/${url.pathname.split('/').at(-1)}-${Date.now()}.json`;await writeFile(file,JSON.stringify(report,null,2));res.end('saved');console.log(file);return;
 }
 let file,mime;if(url.pathname.startsWith('/audio/')){const name=url.pathname.slice(7);if(!manifest.samples.some(s=>s.file===name))throw new Error('Unknown sample');file=`${root}/${name}`;mime='audio/wav';}
 else if(url.pathname==='/speech/vosk-0.0.8.js'){file='public/speech/vosk-0.0.8.js';mime='application/javascript';}
 else if(url.pathname==='/speech/fa-0.42.model'){file='public/speech/fa-0.42.model';mime='application/gzip';}
 else {res.writeHead(404).end();return;}
 res.writeHead(200,{'Content-Type':mime}).end(await readFile(file));
}catch(e){res.writeHead(500).end('QA failed');console.error(e.message);}}).listen(3015,'127.0.0.1',()=>console.log('http://localhost:3015/?variant=before'));
