// Mechanical restoration from the reviewed, fully downloaded source audit.
// IDs/order stay stable so saved daily navigation is not reassigned.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const data=JSON.parse(await readFile('src/data/rumi-daily.json','utf8'));
const report=JSON.parse(await readFile('artifacts/speech-poems/poem-audit/report.json','utf8'));
if(report.total!==360||report.revision!==data.source.dataCommit)throw new Error('Unreviewed or incomplete source');
const normalize=s=>s.normalize('NFC').replace(/[\u064B-\u065F\u0670]/g,'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\s+/g,' ').trim();
for(let i=0;i<data.selections.length;i++){
  const item=data.selections[i],source=report.rows[i];
  if(item.id!==source.id||source.lines.length!==4)throw new Error('Selection identity/order changed');
  for(let n=0;n<4;n++)if(item.lines[n]!==source.lines[n]&&normalize(source.lines[n])!==item.lines[n])throw new Error(`Non-mechanical change ${item.id}:${n}`);
  item.lines=source.lines;
}
data.source.textPolicy='source-verbatim-nfc-whitespace-v2';
await writeFile('src/data/rumi-daily.json',JSON.stringify(data,null,2)+'\n');
const audit={checkedAt:report.checkedAt,revision:report.revision,total:360,changedPoems:report.changedPoems,changedLines:report.changedLines,selectionHash:createHash('sha256').update(JSON.stringify(data.selections)).digest('hex'),attribution:report.attribution,entries:report.rows.map(({id,url,sha256,sourceName,differences})=>({id,url,sha256,sourceName,differences}))};
await writeFile('docs/rumi-source-audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(`Restored ${report.changedLines} lines from traceable source; no lexical substitutions, IDs/order preserved.`);
