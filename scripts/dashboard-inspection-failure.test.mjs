import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
import {dashboardUiQa} from './dashboard-ui-qa.mjs';

const source=readFileSync('scripts/android-webview-inspect.mjs','utf8');
const start=source.indexOf('    let dashboard;');
const end=source.indexOf('    // Isolated emulator permission fixture;',start);
const block=source.slice(start,end);
describe('bounded dashboard inspector failure evidence',()=>{
  it.each(['transport','protocol','assertion','success'])('records safe evidence for %s without later QA actions',async kind=>{
    expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start);
    const writes=[];
    const evaluate=vi.fn(async()=>{
      if(kind==='transport')throw Error('private-transport-payload');
      if(kind==='protocol')return {error:{message:'private-protocol-payload'}};
      if(kind==='assertion')return {result:{result:{value:{passed:false,diagnostics:{code:'STORE_ERROR',phase:'create',elapsedMs:50}}}}};
      return {result:{result:{value:{passed:true,value:{fourCards:true}}}}};
    });
    const context=vm.createContext({evaluate,dashboardUiQa,outputPath:'probe.json',mkdirSync(){},dirname:()=>'.',
      writeFileSync:(path,raw,options)=>{writes.push({path,value:JSON.parse(raw),options});}});
    const run=vm.runInContext(`(async()=>{${block}})()`,context);
    if(kind==='success')await run;else await expect(run).rejects.toThrow('sanitized diagnostics recorded');
    expect(evaluate).toHaveBeenCalledOnce();expect(evaluate.mock.calls[0][1]).toBe(60000);
    expect(writes).toHaveLength(1);expect(JSON.stringify(writes)).not.toContain('private-');
    if(kind==='success')expect(writes[0]).toMatchObject({path:'probe-dashboard.json',value:{fourCards:true}});
    else {
      expect(writes[0]).toMatchObject({path:'probe-dashboard-failure.json',value:{passed:false},options:{flag:'wx'}});
      expect(writes[0].value.diagnostics.code).toBe({transport:'INSPECTION_TIMEOUT_OR_TRANSPORT',protocol:'INSPECTION_FAILED',assertion:'STORE_ERROR'}[kind]);
    }
  });
});
