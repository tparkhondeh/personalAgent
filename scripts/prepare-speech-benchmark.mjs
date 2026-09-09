// Public reference speech only. Not part of app/APK and never uploads user audio.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory='artifacts/speech-poems/benchmark';
await mkdir(directory,{recursive:true});
const endpoint='https://datasets-server.huggingface.co/rows?dataset=Reza2kn%2Ffleurs-fa-benchmark&config=default&split=train&offset=0&length=20';
async function get(url){for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());}catch(e){if(attempt===2)throw e;}}}
let rows;try{rows=JSON.parse(await readFile(`${directory}/public-rows.json`,'utf8'));}catch{rows=JSON.parse((await get(endpoint)).toString());await writeFile(`${directory}/public-rows.json`,JSON.stringify(rows));}
const samples=[];
for(const {row,row_idx} of rows.rows){
  const audio=row.audio[0];const file=`fleurs-${row_idx}.wav`;
  let bytes;try{bytes=await readFile(`${directory}/${file}`);}catch{bytes=await get(audio.src);await writeFile(`${directory}/${file}`,bytes,{flag:'wx'});}
  samples.push({id:`fleurs-${row_idx}`,file,text:row.raw_transcription,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,sourceRow:row_idx});
}
await writeFile(`${directory}/manifest.json`,JSON.stringify({dataset:'Google FLEURS Persian, first 20 rows of public mirror; not representative of all user commands',source:'https://huggingface.co/datasets/google/fleurs',mirror:'https://huggingface.co/datasets/Reza2kn/fleurs-fa-benchmark',license:'Original FLEURS: CC-BY-4.0',selection:'Fixed first 20; not selected using model outputs',samples},null,2)+'\n');
console.log(JSON.stringify(samples.map(({id,text,bytes})=>({id,text,bytes}))));
