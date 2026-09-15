import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const f = vi.hoisted(() => ({
  native: true, available: true, soundId: "dawn",
  pending: [] as {id:number;extra?:Record<string,unknown>;channelId?:string}[],
  plugin: { getSelection:vi.fn(),setSelection:vi.fn(),ensureChannel:vi.fn(),preview:vi.fn(),stopPreview:vi.fn(),openSoundSettings:vi.fn() },
  notifications: {getPending:vi.fn(),cancel:vi.fn(),schedule:vi.fn(),checkPermissions:vi.fn(),createChannel:vi.fn(),checkExactNotificationSetting:vi.fn(),requestPermissions:vi.fn(),changeExactNotificationSetting:vi.fn()},
}));
vi.mock("@capacitor/core", () => ({
  Capacitor:{isNativePlatform:()=>f.native,getPlatform:()=>f.native?"android":"web",isPluginAvailable:()=>f.available},
  registerPlugin:()=>f.plugin,
}));
vi.mock("@capacitor/local-notifications",()=>({LocalNotifications:f.notifications}));
beforeEach(() => {
  vi.resetModules();vi.clearAllMocks();f.native=true;f.available=true;f.soundId="dawn";f.pending=[];
  f.plugin.ensureChannel.mockImplementation(async()=>({soundId:f.soundId,channelId:`tia-alarm-v1-${f.soundId}`}));
  f.notifications.getPending.mockImplementation(async()=>({notifications:f.pending}));
  f.notifications.cancel.mockImplementation(async({notifications})=>{f.pending=f.pending.filter(p=>!notifications.some((n:{id:number})=>n.id===p.id));});
  f.notifications.schedule.mockImplementation(async({notifications})=>{f.pending.push(...notifications);});
  f.notifications.checkPermissions.mockResolvedValue({display:"granted"});
  f.notifications.checkExactNotificationSetting.mockResolvedValue({exact_alarm:"granted"});
  f.notifications.createChannel.mockResolvedValue(undefined);
});
afterEach(()=>{vi.unstubAllGlobals();});
const makeAlarm=(id:string,at:number)=>({id,taskId:"task1",title:"برنامه",scheduledFor:new Date(at).toISOString(),attemptNumber:1,level:"ANDROID_ALARM" as const});
describe("connected native alarm adapters",()=>{
  it("account-boundary cleanup includes both private alarm owners and rejects a late JSON response",()=>{
    const source=readFileSync("src/components/personal-agent-dashboard.tsx","utf8");
    expect(source).toContain("Promise.allSettled([clearApprovedDeviceReminders(),clearNativeEscalationAlarms()])");
    expect(source).toContain('window.removeEventListener("focus",sync);clear();');
    expect(source).toContain("const result = await response.json();\n        if (cancelled) return;\n        const alarms");
  });
  it("urgent owner cleanup cancels existing alarms while a late native reply is pending",async()=>{
    const {syncNativeEscalationAlarms,clearNativeEscalationAlarms}=await import("./native-escalations");
    const first=makeAlarm("existing",Date.now()+60000);await syncNativeEscalationAlarms([first]);
    let release!:()=>void;let entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;});const wait=new Promise<void>(r=>{release=r;});
    f.notifications.schedule.mockImplementationOnce(async({notifications})=>{entered();await wait;f.pending.push(...notifications);});
    const syncing=syncNativeEscalationAlarms([first,makeAlarm("new",Date.now()+60000)]);await started;
    await clearNativeEscalationAlarms();expect(f.pending).toEqual([]);
    release();expect((await syncing).acceptedIds).toEqual([]);expect(f.pending).toEqual([]);
  });
  it("returns only actual accepted server attempt IDs, including retained after an acknowledgement failure",async()=>{
    const {syncNativeEscalationAlarms}=await import("./native-escalations");
    const alarms=[makeAlarm("future",Date.now()+60000),makeAlarm("expired",Date.now()-60000)];
    expect(await syncNativeEscalationAlarms(alarms)).toMatchObject({scheduled:1,acceptedIds:["future"]});
    f.soundId="pulse";
    expect(await syncNativeEscalationAlarms(alarms)).toMatchObject({scheduled:0,retained:1,acceptedIds:["future"]});
    expect(f.notifications.schedule).toHaveBeenCalledOnce();
    expect(f.plugin.ensureChannel).toHaveBeenCalledOnce();
    expect(f.notifications.cancel).not.toHaveBeenCalled();
  });
  it("uses selected alarm sound and a separate ordinary notification channel for approved reminders",async()=>{
    const {syncApprovedDeviceReminders}=await import("./approved-device-reminders");
    let rows=[{id:"a",title:"زنگ",scheduledFor:new Date(Date.now()+60000).toISOString(),channel:"ALARM"},
      {id:"n",title:"اعلان",scheduledFor:new Date(Date.now()+60000).toISOString(),channel:"NATIVE"}];
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({data:rows})})));
    f.soundId="chime";
    await syncApprovedDeviceReminders();
    const old=f.pending[0];
    expect(old).toMatchObject({channelId:"tia-alarm-v1-chime"});
    expect(f.pending[1]).toMatchObject({channelId:"approved-notifications"});
    expect(f.pending[1]).not.toHaveProperty("sound");
    f.soundId="pulse";rows=[...rows,{...rows[0],id:"new"}];
    await syncApprovedDeviceReminders();
    expect(f.pending[0]).toBe(old);expect(f.pending[2]).toMatchObject({channelId:"tia-alarm-v1-pulse"});
    expect(f.notifications.cancel).not.toHaveBeenCalled();
  });
  it("old APKs use legacy sounds with an explicit limitation message",async()=>{
    f.available=false;
    const {syncApprovedDeviceReminders}=await import("./approved-device-reminders");
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({data:[{id:"a",title:"زنگ",scheduledFor:new Date(Date.now()+60000).toISOString(),channel:"ALARM"}]})})));
    expect(await syncApprovedDeviceReminders()).toContain("این نسخه اپ");
    expect(f.pending[0]).toMatchObject({channelId:"approved-reminders"});
    expect(f.plugin.ensureChannel).not.toHaveBeenCalled();
  });
  it("invalid server data and denied permission cannot falsely schedule or clear valid pending alarms",async()=>{
    const {syncApprovedDeviceReminders}=await import("./approved-device-reminders");
    f.pending=[{id:123,extra:{owner:"hamrah-approved-reminders"}}];
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({data:[{id:"bad",scheduledFor:"invalid"}]})})));
    await expect(syncApprovedDeviceReminders()).rejects.toThrow("Invalid");
    expect(f.notifications.cancel).not.toHaveBeenCalled();
    expect(f.notifications.schedule).not.toHaveBeenCalled();
    const {syncNativeEscalationAlarms}=await import("./native-escalations");
    f.notifications.checkPermissions.mockResolvedValue({display:"denied"});
    expect((await syncNativeEscalationAlarms([makeAlarm("a",Date.now()+60000)])).acceptedIds).toEqual([]);
  });
  it("browser calls never fall through to native scheduling or permission prompts",async()=>{
    f.native=false;
    const {syncNativeEscalationAlarms}=await import("./native-escalations");
    expect(await syncNativeEscalationAlarms([makeAlarm("a",Date.now()+60000)])).toMatchObject({native:false,acceptedIds:[]});
    expect(f.notifications.getPending).not.toHaveBeenCalled();expect(f.notifications.requestPermissions).not.toHaveBeenCalled();
  });
});
