import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {speechErrors} from './speech-metrics.mjs';
const root='artifacts/speech-poems/benchmark';
const files=await readdir(root);
const input=async name=>JSON.parse(await readFile(`${root}/${name}`,'utf8'));
const summarize=(rows,field='text',time='seconds')=>{let words=0,characters=0,wordErrors=0,characterErrors=0,seconds=0;for(const r of rows){const e=speechErrors(r.reference,r[field]);words+=e.words;characters+=e.characters;wordErrors+=e.wordErrors;characterErrors+=e.characterErrors;seconds+=r[time]||0;}return{samples:rows.length,words,wordErrors,wer:wordErrors/words,cer:characterErrors/characters,seconds};};
const browser={};for(const variant of ['before','after']){const file=files.filter(n=>n.startsWith(variant+'-')).sort().at(-1);const report=await input(file);if(report.cancelled||report.results.length!==20||report.results.some(r=>r.error))throw new Error('Incomplete browser benchmark');browser[variant]={...summarize(report.results,'text','elapsedMs'),seconds:report.results.reduce((s,r)=>s+r.elapsedMs/1000,0),loadingSeconds:report.results.reduce((s,r)=>s+r.loadingMs/1000,0),file,userAgent:report.userAgent};}
const server={};for(const model of ['vosk','whisper','shenava']){const report=await input(`${model}-server.json`);server[model]={...report,results:undefined,summary:summarize(report.results)};}
const noise=await input('noise-comparison.json'),conditions={};for(const condition of ['clean','noise15db','pauses']){const rows=noise.results.filter(r=>r.condition===condition);conditions[condition]={vosk:summarize(rows,'vosk','voskSeconds'),shenava:summarize(rows,'shenava','shenavaSeconds')};}
const manifest=await input('manifest.json');
const sources=files.filter(n=>/^(before-|after-|vosk-server|whisper-server|shenava-server|noise-comparison|manifest)/.test(n));
const evidenceHashes=Object.fromEntries(await Promise.all(sources.map(async name=>[name,createHash('sha256').update(await readFile(`${root}/${name}`)).digest('hex')])));
const result={date:'2026-09-09',caveat:'Small public read-speech set; possible training overlap unknown; not physical mic, conversational commands or guaranteed real-world accuracy. Browser warm-cache timing includes model setup; server timing excludes client upload. No personal audio.',manifest,browser,server,conditions,evidenceHashes};
await writeFile('docs/speech-benchmark-2026-09-09.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({browser,server:Object.fromEntries(Object.entries(server).map(([k,v])=>[k,v.summary])),conditions},null,2));
