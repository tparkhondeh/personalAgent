import { readdirSync, mkdirSync, copyFileSync, constants } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function evidenceName(path) {
  const normalized=path.replaceAll('\\','/');
  const api=normalized.match(/(?:^|\/)(?:android-evidence-|retest-android-|android-)(33|34|36)(?:-\d+)?\//)?.[1];
  if(!api)throw new Error('Evidence must identify its Android API');
  const name=basename(normalized);
  if(!/^[a-z0-9-]+\.png$/.test(name))throw new Error('Unexpected screenshot filename');
  // Keep initial system failures as diagnostic evidence, never as a passed view.
  const diagnostic=/launcher-anr/.test(name)?'diagnostic-':'';
  return `${diagnostic}api-${api}-${name}`;
}

export function prepareEvidence(source,destination) {
  const paths=[];
  const visit=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error('Symlink in release evidence');
    const path=join(directory,entry.name);
    if(entry.isDirectory())visit(path);else if(entry.isFile()&&entry.name.endsWith('.png'))paths.push(path);
  }};
  visit(source);
  if(paths.length===0)throw new Error('No screenshots to publish');
  const names=paths.map(evidenceName);
  if(new Set(names).size!==names.length)throw new Error('Duplicate release evidence name');
  mkdirSync(destination,{recursive:true});
  for(let i=0;i<paths.length;i++)copyFileSync(paths[i],join(destination,names[i]),constants.COPYFILE_EXCL);
  return names;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [source,destination]=process.argv.slice(2);
  if(!source||!destination)throw new Error('Source and destination required');
  console.log(`Prepared ${prepareEvidence(source,destination).length} uniquely named evidence files`);
}
