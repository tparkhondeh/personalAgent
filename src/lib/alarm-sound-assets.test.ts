import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ALARM_SOUNDS } from "./alarm-sounds";
import { alarmSoundBundle, synthesizeAlarmSound } from "../../scripts/generate-alarm-sounds.mjs";

describe("original sound assets and the actual offline helper",()=>{
  it("contains three distinct bounded PCM sounds, identical in web/offline/native resources",async()=>{
    const digests=new Set<string>();
    for(const sound of ALARM_SOUNDS){
      const generated=synthesizeAlarmSound(sound.id);
      expect(generated.subarray(0,4).toString()).toBe("RIFF");
      expect(generated.subarray(8,12).toString()).toBe("WAVE");
      expect(generated.readUInt16LE(22)).toBe(1);expect(generated.readUInt32LE(24)).toBe(22050);
      expect(generated.readUInt16LE(34)).toBe(16);expect(generated.readUInt32LE(40)/44100).toBe(2.4);
      const values=Array.from({length:(generated.length-44)/2},(_,i)=>Math.abs(generated.readInt16LE(44+i*2)));
      expect(Math.max(...values)).toBeGreaterThan(7000);expect(Math.max(...values)).toBeLessThan(32767);
      expect(values.slice(-100).every(value=>value===0)).toBe(true);
      for(const dir of ["public/alarm-sounds","mobile-shell/alarm-sounds","android/app/src/main/res/raw"]){
        expect((await readFile(path.join(process.cwd(),dir,sound.file))).equals(generated)).toBe(true);
      }
      digests.add(createHash("sha256").update(generated).digest("hex"));
    }
    expect(digests.size).toBe(3);
  });
  it("generated offline script is deterministic and executes the shared controller/scheduler without network imports",async()=>{
    const script=await alarmSoundBundle(process.cwd());
    expect(await alarmSoundBundle(process.cwd())).toBe(script);
    expect(await readFile("mobile-shell/alarm-sounds.js", "utf8")).toBe(script);
    expect(script).not.toMatch(/\b(?:import|require)\s*\(/);
    expect(script).not.toContain("export ");
    const plugin={getSelection:vi.fn(async()=>({soundId:"pulse"})),ensureChannel:vi.fn(async()=>({soundId:"pulse",channelId:"tia-alarm-v1-pulse"}))};
    const sandbox={window:{Capacitor:{getPlatform:()=>"android",isPluginAvailable:()=>true,Plugins:{TiaAlarmSounds:plugin}}}};
    vm.runInNewContext(script,sandbox);
    const helper=(sandbox.window as typeof sandbox.window & {HamrahAlarmSounds:Record<string, (...args:unknown[])=>unknown>}).HamrahAlarmSounds;
    const controller=helper.createController() as {read:()=>Promise<{soundId:string;mode:string}>};
    expect(await controller.read()).toMatchObject({soundId:"pulse",mode:"android"});
    const legacy=vi.fn();
    expect(await helper.prepareAlarm(legacy,"old")).toMatchObject({channelId:"tia-alarm-v1-pulse",sound:"tia_alarm_pulse_v1.wav",legacySound:false});
    expect(legacy).not.toHaveBeenCalled();
    expect(typeof helper.mount).toBe("function");expect(typeof helper.createDeviceAlarmScheduler).toBe("function");
    expect(typeof helper.installAccountAlarmPrivacyGuard).toBe("function");
  });
});
