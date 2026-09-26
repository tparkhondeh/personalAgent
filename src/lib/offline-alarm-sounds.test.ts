import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createDeviceAlarmScheduler, type DeviceAlarmSchedulerPort, type ScheduledDeviceAlarm } from "./device-alarm-scheduler";

type Task = {id:string;title:string;deadline:string;updatedAt?:string;done?:boolean;archived?:boolean;notificationId?:number;notificationIds?:number[];notificationSchedule?:unknown;approvedPlan?:{channels:string[]}};
const app=readFileSync("mobile-shell/app.js","utf8");
const start=app.indexOf("  // Keep mapping persistence"),end=app.indexOf("  function taskMarkup(",start);
const buttonsStart=app.indexOf("  let enablingNotifications ="),buttonsEnd=app.indexOf('  $$("input[name=reminder]")',buttonsStart);

function fixture(initial:Task[]=[{id:"new",title:"زنگ",deadline:new Date(100000).toISOString(),updatedAt:"first"}],seed:ScheduledDeviceAlarm[]=[]){
  const state={tasks:structuredClone(initial),pending:seed,now:10000,sound:"dawn",saved:"",deny:false,notice:""};
  const notificationIds=(task:Task)=>[...new Set([...(task.notificationIds??[]),task.notificationId].filter((id):id is number=>Number.isInteger(id)&&Number(id)>0))];
  const notificationTimes=vi.fn(()=>[50000,100000,150000]);
  const localNotifications={
    getPending:vi.fn(async()=>({notifications:state.pending})),
    getDeliveredNotifications:vi.fn(async()=>({notifications:[]})),
    removeDeliveredNotifications:vi.fn(async()=>{}),
    checkPermissions:vi.fn(async()=>({display:"granted"})),
    createChannel:vi.fn(async()=>{}),
    schedule:vi.fn(async({notifications}:{notifications:ScheduledDeviceAlarm[]})=>{state.pending.push(...notifications);}),
    cancel:vi.fn(async({notifications}:{notifications:{id:number}[]})=>{state.pending=state.pending.filter(p=>!notifications.some(n=>n.id===p.id));}),
  };
  const saveTasks=vi.fn((next:Task[])=>{if(state.deny)return false;state.saved=JSON.stringify(next);state.tasks=next;return true;});
  const ensureNotificationAccess=vi.fn(async()=>true);
  const handlers=new Map<string,()=>Promise<void>>();
  const buttonNodes=new Map<string,{disabled:boolean;addEventListener:(type:string,cb:()=>Promise<void>)=>void}>();
  const $=(id:string)=>{if(!buttonNodes.has(id))buttonNodes.set(id,{disabled:false,addEventListener:(_type,cb)=>{handlers.set(id,cb);}});return buttonNodes.get(id)!;};
  const alarmStatus={textContent:""};let nextId=100;
  const env={
    taskStoreReady:true,taskWriteBusy:false,
    domain:{notificationIds,notificationTimes,normalizeOffsets:()=>[1440,180,60],manualRepeatPolicy:()=>undefined},planner:{},localNotifications,saveTasks,ensureNotificationAccess,
    notificationId:()=>++nextId,channelId:"urgent-overdue",alarmStatus,$,toFa:String,
    alarmSounds:{
      LEGACY_ALARM_SOUND_HELP:"legacy plugin",
      createDeviceAlarmScheduler:(port:DeviceAlarmSchedulerPort)=>createDeviceAlarmScheduler({...port,now:()=>state.now}),
      prepareAlarm:vi.fn(async()=>({channelId:`tia-alarm-v1-${state.sound}`,sound:`tia_alarm_${state.sound}_v1.wav`,legacySound:false})),
    },
    Date:class extends Date{static now(){return state.now;}},
  };
  Object.defineProperty(env,"tasks",{get:()=>state.tasks});
  const api=vm.runInNewContext(app.slice(start,end)+app.slice(buttonsStart,buttonsEnd)+";({scheduleNotification,cancelNotifications,reserveAlarmCancellations})",env) as {
    scheduleNotification:(task:Task,kind?:string)=>Promise<boolean>;cancelNotifications:()=>Promise<void>;
    reserveAlarmCancellations:(previous:Task,next:Task)=>Task;
  };
  return {state,api,notificationTimes,localNotifications,saveTasks,ensureNotificationAccess,alarmStatus,enable:()=>handlers.get("#enable-notifications")!(),testAlarm:()=>handlers.get("#test-alarm")!()};
}
describe("actual bundled alarm integration",()=>{
  it("mounts shared controls once and registers disposal without previewing",()=>{
    const mount=vi.fn(()=>vi.fn()),addEventListener=vi.fn(),root={};
    const a=app.indexOf("  const alarmSounds ="),b=app.indexOf("  const dateTime =",a);
    vm.runInNewContext(app.slice(a,b),{window:{HamrahAlarmSounds:{mount},addEventListener},$:()=>root});
    expect(mount).toHaveBeenCalledExactlyOnceWith(root);expect(addEventListener).toHaveBeenCalledWith("pagehide",expect.any(Function),{once:true});
  });
  it("persists stable timestamps/IDs before scheduling; retries and new sounds preserve existing alarms",async()=>{
    const f=fixture(),task=f.state.tasks[0];
    await Promise.all([f.api.scheduleNotification(task),f.api.scheduleNotification(task)]);
    expect(f.localNotifications.schedule).toHaveBeenCalledOnce();expect(f.notificationTimes).toHaveBeenCalledOnce();
    expect(JSON.parse(f.state.saved)[0].notificationSchedule).toEqual({version:1,entries:[{id:101,at:50000},{id:102,at:100000},{id:103,at:150000}]});
    expect(f.saveTasks.mock.invocationCallOrder[0]).toBeLessThan(f.localNotifications.schedule.mock.invocationCallOrder[0]);
    const old=f.state.pending[0];f.state.sound="chime";
    const second={id:"new2",title:"جدید",deadline:task.deadline};f.state.tasks.push(second);
    await f.api.scheduleNotification(second);await f.api.scheduleNotification(task);
    expect(f.state.pending[0]).toBe(old);expect(old.channelId).toBe("tia-alarm-v1-dawn");
    expect(f.state.pending.at(-1)?.channelId).toBe("tia-alarm-v1-chime");expect(f.localNotifications.cancel).not.toHaveBeenCalled();
  });
  it("reload and partial-failure retries keep the original ID/time mapping and skip elapsed entries",async()=>{
    const f=fixture();
    f.localNotifications.schedule.mockImplementationOnce(async({notifications})=>{f.state.pending=[notifications[0]];throw new Error("lost reply");});
    await expect(f.api.scheduleNotification(f.state.tasks[0])).rejects.toThrow("lost reply");
    const reloaded=fixture(JSON.parse(f.state.saved),f.state.pending);reloaded.state.now=60000;
    expect(await reloaded.api.scheduleNotification(reloaded.state.tasks[0])).toBe(true);
    expect(reloaded.notificationTimes).not.toHaveBeenCalled();
    expect(reloaded.localNotifications.schedule.mock.calls[0][0].notifications.map(n=>[n.id,n.schedule.at.getTime()])).toEqual([[102,100000],[103,150000]]);
    reloaded.state.pending=[];reloaded.state.now=200000;
    expect(await reloaded.api.scheduleNotification(reloaded.state.tasks[0])).toBe(false);
    expect(reloaded.localNotifications.schedule).toHaveBeenCalledOnce();
  });
  it("legacy IDs without times retain only pending alarms; activation never recreates missing ones",async()=>{
    const f=fixture([{id:"legacy",title:"قدیمی",deadline:new Date(100000).toISOString(),notificationIds:[41,42]}],[{id:41,title:"قدیمی",body:"یادآوری",channelId:"legacy",smallIcon:"ic_stat_hamrah",autoCancel:true,schedule:{at:new Date(100000),allowWhileIdle:true},extra:{owner:"hamrah-local"}}]);
    await Promise.all([f.enable(),f.enable()]);await f.enable();
    expect(f.localNotifications.schedule).not.toHaveBeenCalled();expect(f.localNotifications.cancel).not.toHaveBeenCalled();
    expect(f.saveTasks).not.toHaveBeenCalled();expect(f.notificationTimes).not.toHaveBeenCalled();
    expect(f.state.pending.map(n=>n.id)).toEqual([41]);expect(f.alarmStatus.textContent).toContain("قدیمی");
    f.state.pending=[];expect(await f.api.scheduleNotification(f.state.tasks[0])).toBe(false);
  });
  it("activation is serialized and does not cancel/reassign a new task's existing mapping",async()=>{
    const f=fixture();await Promise.all([f.enable(),f.enable()]);const saved=f.state.saved;
    await f.enable();expect(f.state.saved).toBe(saved);expect(f.localNotifications.schedule).toHaveBeenCalledOnce();
    expect(f.localNotifications.cancel).not.toHaveBeenCalled();
  });
  it("completion waits for native scheduling in flight and leaves no future alarm",async()=>{
    const f=fixture();let release!:()=>void,entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}),waiting=new Promise<void>(r=>{release=r;});
    f.localNotifications.schedule.mockImplementationOnce(async({notifications})=>{entered();await waiting;f.state.pending.push(...notifications);});
    const task=f.state.tasks[0],sync=f.api.scheduleNotification(task);await started;
    f.saveTasks([f.api.reserveAlarmCancellations(f.state.tasks[0],{...f.state.tasks[0],done:true})]);
    const cancel=f.api.cancelNotifications();release();await Promise.all([sync,cancel]);
    expect(f.state.pending).toEqual([]);expect(await f.api.scheduleNotification(task)).toBe(false);
    f.state.tasks[0].done=true;const reloaded=fixture(structuredClone(f.state.tasks));
    expect(await reloaded.api.scheduleNotification(reloaded.state.tasks[0])).toBe(false);
  });
  it("denied permission saves the snapshot, while failed persistence never dispatches",async()=>{
    const f=fixture();f.ensureNotificationAccess.mockResolvedValueOnce(false);
    expect(await f.api.scheduleNotification(f.state.tasks[0])).toBe(false);expect(f.state.saved).not.toBe("");
    f.state.now=60000;await f.api.scheduleNotification(f.state.tasks[0]);
    expect(f.localNotifications.schedule.mock.calls[0][0].notifications.map(n=>n.id)).toEqual([102,103]);
    const failed=fixture();failed.state.deny=true;
    await expect(failed.api.scheduleNotification(failed.state.tasks[0])).rejects.toThrow("شناسه یادآوری ذخیره نشد");
    expect(failed.localNotifications.schedule).not.toHaveBeenCalled();expect(failed.state.tasks[0].notificationIds).toBeUndefined();
  });
  it("an explicit edit starts a new mapping after cancelling the old version, without touching another task",async()=>{
    const f=fixture();await f.api.scheduleNotification(f.state.tasks[0]);
    const other={id:"other",title:"دیگر",deadline:new Date(100000).toISOString()};f.state.tasks.push(other);
    await f.api.scheduleNotification(other);const otherIds=f.state.pending.slice(3).map(n=>n.id);
    const edited={...f.state.tasks[0],title:"ویرایش",updatedAt:"second",deadline:new Date(240000).toISOString(),notificationIds:[],notificationId:undefined,notificationSchedule:undefined};
    f.state.tasks[0]=f.api.reserveAlarmCancellations(f.state.tasks[0],edited);f.notificationTimes.mockReturnValue([180000]);
    await f.api.scheduleNotification(edited);
    expect(f.state.pending.map(n=>n.id)).toEqual([...otherIds,107]);
    expect(f.state.pending.at(-1)?.schedule.at.getTime()).toBe(180000);
  });
  it("rejects corrupt mapping without overwriting it, separates ordinary notifications, and locks test clicks",async()=>{
    const corrupt=fixture([{id:"broken",title:"خراب",deadline:new Date(100000).toISOString(),notificationIds:[1],notificationSchedule:{version:1,entries:[{id:2,at:100000}]}}]);
    await expect(corrupt.api.scheduleNotification(corrupt.state.tasks[0])).rejects.toThrow("معتبر نیست");expect(corrupt.saveTasks).not.toHaveBeenCalled();
    const normal=fixture([{id:"ordinary",title:"اعلان",deadline:new Date(100000).toISOString(),approvedPlan:{channels:["NATIVE"]}}]);
    await normal.api.scheduleNotification(normal.state.tasks[0]);
    expect(normal.state.pending.every(n=>n.channelId==="approved-local-notifications"&&!n.sound&&!n.schedule.allowWhileIdle)).toBe(true);
    const test=fixture([]);await Promise.all([test.testAlarm(),test.testAlarm()]);
    expect(test.localNotifications.schedule).toHaveBeenCalledOnce();expect(test.state.pending).toHaveLength(1);expect(test.saveTasks).not.toHaveBeenCalled();
  });
});
