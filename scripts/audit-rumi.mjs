// Read-only audit; never invent, rerank or silently rewrite poetry.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const data=JSON.parse(await readFile('src/data/rumi-daily.json','utf8'));
const out=path.resolve(process.argv[2]||'artifacts/speech-poems/poem-audit');
await mkdir(out,{recursive:true});
const revision=data.source.dataCommit;
const rows=[];let next=0;
async function worker(){
  while(next<data.selections.length){
    const item=data.selections[next++];
    const name=new URL(item.sourceUrl).pathname.split('/').at(-1);
    const url=`https://raw.githubusercontent.com/ganjoor/ganjoor-data/${revision}/poets/moulavi/shams/robaeesh/${name}.json`;
    const file=path.join(out,`${name}.json`);
    let raw;
    try { raw=await readFile(file,'utf8'); }
    catch { const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);raw=await response.text();await writeFile(file,raw,{flag:'wx'}); }
    const source=JSON.parse(raw);
    const verses=[...source.Verses].sort((a,b)=>a.VOrder-b.VOrder);
    if(source.Id!==item.poemId||`https://ganjoor.net${source.FullUrl}`!==item.sourceUrl||verses.length!==4||verses.some((v,i)=>v.VOrder!==i+1||v.CoupletIndex!==Math.floor(i/2)||v.Position!==(i%2?'Left':'Right')))throw new Error(`Invalid source identity/order: ${name}`);
    const lines=verses.map(v=>v.Text.normalize('NFC').replace(/\s+/g,' ').trim());
    const differences=lines.flatMap((text,i)=>text===item.lines[i]?[]:[{line:i+1,before:item.lines[i],source:text}]);
    rows.push({id:item.id,poemId:item.poemId,url:item.sourceUrl,rawUrl:url,sha256:createHash('sha256').update(raw).digest('hex'),sourceName:source.SourceName,sourceUrlSlug:source.SourceUrlSlug,fullTitle:source.FullTitle,lines,differences});
  }
}
await Promise.all(Array.from({length:4},worker));
rows.sort((a,b)=>data.selections.findIndex(x=>x.id===a.id)-data.selections.findIndex(x=>x.id===b.id));
const report={checkedAt:new Date().toISOString(),revision,total:rows.length,changedPoems:rows.filter(r=>r.differences.length).length,changedLines:rows.reduce((n,r)=>n+r.differences.length,0),attribution:'Located in Ganjoor Shams quatrains; not independent manuscript authentication',rows};
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,changedPoems:report.changedPoems,changedLines:report.changedLines,examples:rows.filter(r=>r.differences.length).slice(0,3),report:path.join(out,'report.json')}));
