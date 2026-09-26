import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureHierarchy, systemDialog } from './android-system-ui-check.mjs';

const clean='<hierarchy><node text="tia"/></hierarchy>';
const blocked='<hierarchy><node resource-id="android:id/aerr_close" text="tia"/></hierarchy>';
const nullRoot='ERROR: null root node returned by UiTestAutomationBridge.';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());

describe('bounded fresh UI hierarchy retry',()=>{
  it.each(['', '<hierarchy><node text="partial"', '<hierarchy></hierarchy>'])('retries status-0 invalid XML, preserving failed stdout/XML: %s',async invalid=>{
    const paths=[],reads=[],reports=[];
    const run=(...args)=>{
      if(args[0]==='shell'){paths.push(args[3]);return {stdout:'capture stdout',stderr:paths.length===1?nullRoot:''};}
      reads.push(args[2]);return paths.length===1?invalid:clean;
    };
    const result=captureHierarchy(run,entry=>reports.push(entry),'fresh');
    await vi.runAllTimersAsync();expect(await result).toBe(clean);
    expect(paths).toHaveLength(2);expect(new Set(paths).size).toBe(2);expect(reads).toEqual(paths);
    expect(reports).toEqual([expect.objectContaining({attempt:0,path:paths[0],status:0,stdout:'capture stdout',stderr:nullRoot,xml:invalid})]);
  });
  it('retries a null-root missing file without reading an earlier attempt',async()=>{
    const paths=[],reports=[];
    const result=captureHierarchy((...args)=>{
      if(args[0]==='shell'){paths.push(args[3]);return {stdout:'',stderr:paths.length===1?nullRoot:''};}
      expect(args[2]).toBe(paths.at(-1));
      if(paths.length===1)throw Object.assign(Error('cat failed'),{status:1,stderr:'No such file or directory'});
      return clean;
    },entry=>reports.push(entry),'missing');
    await vi.runAllTimersAsync();expect(await result).toBe(clean);
    expect(reports[0]).toMatchObject({status:0,stderr:nullRoot,xml:'',readStatus:1,readStderr:'No such file or directory'});
  });
  it('fails after exactly three bad captures; never returns an absent hierarchy',async()=>{
    const paths=[],reports=[];
    const rejected=expect(captureHierarchy((...args)=>{
      if(args[0]==='shell'){paths.push(args[3]);return {stdout:'',stderr:nullRoot};}
      return '';
    },entry=>reports.push(entry),'exhausted')).rejects.toThrow('Missing Android UI hierarchy');
    await vi.runAllTimersAsync();await rejected;
    expect(paths).toHaveLength(3);expect(new Set(paths).size).toBe(3);expect(reports).toHaveLength(3);
  });
  it.each([0,137])('never retries away a valid system error (dump status %i)',async status=>{
    let dumps=0;
    const xml=await captureHierarchy((...args)=>{
      if(args[0]==='shell'){dumps++;if(status===137)throw Object.assign(Error('killed'),{status});return {stdout:'',stderr:nullRoot};}
      return blocked;
    },()=>{},'blocked');
    expect(systemDialog(xml).blocked).toBe(true);expect(dumps).toBe(1);
  });
  it.each([0,137])('fails a positive system-error marker in truncated XML without a second dump (status %i)',async status=>{
    let dumps=0;const reports=[];
    const partial='<hierarchy><node resource-id="android:id/aerr_close';
    await expect(captureHierarchy((...args)=>{
      if(args[0]==='shell'){dumps++;if(status===137)throw Object.assign(Error('killed'),{status});return '';}
      return partial;
    },entry=>reports.push(entry),'partial-anr')).rejects.toThrow('System Crash/ANR marker');
    expect(dumps).toBe(1);expect(reports).toHaveLength(1);expect(reports[0].xml).toBe(partial);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('also rejects partial system-error XML returned by a failed read before retrying',async()=>{
    let dumps=0;
    await expect(captureHierarchy((...args)=>{
      if(args[0]==='shell'){dumps++;return {stdout:'',stderr:nullRoot};}
      throw Object.assign(Error('read interrupted'),{status:1,stdout:'<hierarchy><node resource-id="android:id/aerr_close"'});
    },()=>{},'partial-read-anr')).rejects.toThrow('System Crash/ANR marker');
    expect(dumps).toBe(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('does not accept clean-looking XML paired with a null-root diagnostic',async()=>{
    let dumps=0;
    const result=captureHierarchy((...args)=>args[0]==='shell'
      ? {stdout:'',stderr:++dumps===1?nullRoot:''}:clean,()=>{},'contradiction');
    await vi.runAllTimersAsync();expect(await result).toBe(clean);expect(dumps).toBe(2);
  });
  it.each(['dump','read'])('fails unrelated %s transport errors immediately',async stage=>{
    let dumps=0;const reports=[];
    await expect(captureHierarchy((...args)=>{
      if(args[0]==='shell'){dumps++;if(stage==='read')return '';}
      throw Object.assign(Error('transport disconnected'),{status:1,stderr:'device offline'});
    },entry=>reports.push(entry),'transport')).rejects.toThrow('transport disconnected');
    expect(dumps).toBe(1);expect(reports).toHaveLength(1);
  });
  it('also retries missing/truncated status-0 captures from legacy string-returning callers',async()=>{
    let dumps=0;
    const result=captureHierarchy((...args)=>{if(args[0]==='shell'){dumps++;return 'dump stdout';}return dumps===1?'truncated':clean;},()=>{},'legacy');
    await vi.runAllTimersAsync();expect(await result).toBe(clean);expect(dumps).toBe(2);
  });
});
