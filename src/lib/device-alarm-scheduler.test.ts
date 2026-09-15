import { describe, expect, it, vi } from "vitest";
import { createDeviceAlarmScheduler, type DeviceAlarmRequest, type DeviceAlarmSchedulerPort, type PendingDeviceAlarm, type ScheduledDeviceAlarm } from "./device-alarm-scheduler";

const future = 100_000;
const request = (id: number, alarm = true, at = future): DeviceAlarmRequest => ({ id, alarm, at, title:"tia",body:"آزمون",extra:{attemptId:`attempt-${id}`} });
function fixture() {
  let pending: PendingDeviceAlarm[] = [], time = 10_000, sound = "dawn";
  const port = {
    owner: "test-owner", now: () => time,
    getPending: vi.fn(async () => ({ notifications: pending })),
    cancel: vi.fn(async ({notifications}: {notifications:{id:number}[]}) => {pending=pending.filter(n=>!notifications.some(x=>x.id===n.id));}),
    schedule: vi.fn(async ({notifications}: {notifications:ScheduledDeviceAlarm[]}) => {pending.push(...notifications);}),
    checkPermissions: vi.fn(async () => ({ display: "granted" })),
    prepareAlarm: vi.fn(async () => ({channelId:`tia-alarm-v1-${sound}`,sound:`tia_alarm_${sound}_v1.wav`,legacySound:false})),
    prepareNotification: vi.fn(async () => "ordinary-notifications"),
  } satisfies DeviceAlarmSchedulerPort;
  return {port, scheduler:createDeviceAlarmScheduler(port), setPending:(value:PendingDeviceAlarm[])=>{pending=value;},setTime:(value:number)=>{time=value;},setSound:(value:string)=>{sound=value;},pending:()=>pending};
}
describe("stable device alarm reconciliation", () => {
  it("keeps old pending times/sounds while the newly added alarm gets the new selection", async () => {
    const f = fixture();
    await f.scheduler.sync(async () => [request(1)]);
    const old = f.pending()[0];
    f.setSound("chime");
    const result = await f.scheduler.sync(async () => [request(1,true,future+50000),request(2),request(3,false)]);
    expect(result).toMatchObject({scheduled:2,retained:1,acceptedIds:[1,2,3]});
    expect(f.pending()[0]).toBe(old);
    expect(old).toMatchObject({channelId:"tia-alarm-v1-dawn",schedule:{at:new Date(future)}});
    expect(f.pending()[1]).toMatchObject({channelId:"tia-alarm-v1-chime",sound:"tia_alarm_chime_v1.wav",schedule:{allowWhileIdle:true}});
    expect(f.pending()[2]).toMatchObject({channelId:"ordinary-notifications",schedule:{allowWhileIdle:false}});
    expect(f.pending()[2]).not.toHaveProperty("sound");
    expect(f.port.cancel).not.toHaveBeenCalled();
  });
  it("rejects a numeric ID collision within the same owner without replacing it", async () => {
    const f=fixture();
    f.setPending([{id:1,extra:{owner:"test-owner",attemptId:"a-different-attempt"}}]);
    await expect(f.scheduler.sync(async()=>[request(1)])).rejects.toThrow("collision");
    expect(f.port.cancel).not.toHaveBeenCalled();expect(f.port.schedule).not.toHaveBeenCalled();
  });
  it("serializes retries and double clicks without duplicate schedule calls", async () => {
    const f=fixture();
    const results=await Promise.all(Array.from({length:4},()=>f.scheduler.sync(async()=>[request(1)])));
    expect(f.port.schedule).toHaveBeenCalledOnce();
    expect(results.map(r=>r.scheduled)).toEqual([1,0,0,0]);
    expect(results.every(r=>r.acceptedIds.join()==="1")).toBe(true);
  });
  it("retries partial/uncertain scheduling using the native pending receipts", async () => {
    const f=fixture();
    f.port.schedule.mockImplementationOnce(async ({notifications})=>{f.setPending([notifications[0]]);throw new Error("lost reply");});
    await expect(f.scheduler.sync(async()=>[request(1),request(2)])).rejects.toThrow("lost reply");
    const result=await f.scheduler.sync(async()=>[request(1),request(2)]);
    expect(f.port.schedule.mock.calls[1][0].notifications.map(n=>n.id)).toEqual([2]);
    expect(result.acceptedIds).toEqual([1,2]);
  });
  it("does not resurrect already delivered, overdue or just-expired reminders", async () => {
    const f=fixture();
    await f.scheduler.sync(async()=>[request(1)]);
    f.setPending([]);f.setTime(future+1);
    expect((await f.scheduler.sync(async()=>[request(1),request(2,true,1)])).acceptedIds).toEqual([]);
    expect(f.port.schedule).toHaveBeenCalledOnce();
    f.port.prepareAlarm.mockImplementationOnce(async()=>{f.setTime(future+20);return {channelId:"c",sound:"s",legacySound:false};});
    expect((await f.scheduler.sync(async()=>[request(3,true,future+10)])).scheduled).toBe(0);
    expect(f.port.schedule).toHaveBeenCalledOnce();
  });
  it("accepts a fresh persisted initial grace time, without renewing it on retry", async () => {
    const f=fixture();
    const initial=request(1,true,20_000);
    expect((await f.scheduler.sync(async()=>[initial])).acceptedIds).toEqual([1]);
    f.setPending([]);f.setTime(20_001);
    expect((await f.scheduler.sync(async()=>[initial])).acceptedIds).toEqual([]);
    expect(f.port.schedule).toHaveBeenCalledOnce();
  });
  it("completion removes owned reminders, retains others and never requests permissions", async () => {
    const f=fixture();
    await f.scheduler.sync(async()=>[request(1)]);
    f.setPending([...f.pending(),{id:9,extra:{owner:"other"}}]);
    f.port.checkPermissions.mockResolvedValue({display:"denied"});
    await Promise.all([f.scheduler.sync(async()=>[]),f.scheduler.sync(async()=>[])]);
    expect(f.pending()).toEqual([{id:9,extra:{owner:"other"}}]);
    expect(f.port.cancel).toHaveBeenCalledOnce();
  });
  it("does not acknowledge denied/overdue new alarms but accepts an existing pending one", async () => {
    const f=fixture();
    f.setPending([{id:1,extra:{owner:"test-owner"}}]);
    f.port.checkPermissions.mockResolvedValue({display:"denied"});
    expect(await f.scheduler.sync(async()=>[request(1),request(2),request(3,true,1)])).toMatchObject({scheduled:0,acceptedIds:[1],permissionRequired:true});
    expect(f.port.prepareAlarm).not.toHaveBeenCalled();
  });
  it("clear invalidates a load in flight and queued sync, with no alarm left behind", async () => {
    const f=fixture();
    let resolve!:(rows:DeviceAlarmRequest[])=>void;
    const loading=new Promise<DeviceAlarmRequest[]>(r=>{resolve=r;});
    const first=f.scheduler.sync(()=>loading);
    await Promise.resolve();
    const second=f.scheduler.sync(async()=>[request(2)]);
    const clear=f.scheduler.clear();
    resolve([request(1)]);
    await Promise.all([first,second,clear]);
    expect(f.port.schedule).not.toHaveBeenCalled();
    expect(f.pending()).toEqual([]);
  });
  it("clear also cancels native scheduling already in progress", async () => {
    const f=fixture();let release!:()=>void;let entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;});const wait=new Promise<void>(r=>{release=r;});
    f.port.schedule.mockImplementationOnce(async({notifications})=>{entered();await wait;f.setPending(notifications);});
    const sync=f.scheduler.sync(async()=>[request(1)]);await started;
    const clear=f.scheduler.clear();release();
    const result=await sync;await clear;
    expect(result.acceptedIds).toEqual([]);expect(f.pending()).toEqual([]);
  });
  it("clears existing private alarms without waiting for a stalled network load", async () => {
    const f=fixture();f.setPending([{id:8,extra:{owner:"test-owner"}},{id:9,extra:{owner:"other"}}]);
    let release!:(rows:DeviceAlarmRequest[])=>void;
    const stalled=new Promise<DeviceAlarmRequest[]>(r=>{release=r;});
    const sync=f.scheduler.sync(()=>stalled);await Promise.resolve();
    await f.scheduler.clear();
    expect(f.pending()).toEqual([{id:9,extra:{owner:"other"}}]);
    release([request(1)]);expect((await sync).acceptedIds).toEqual([]);
    expect(f.port.schedule).not.toHaveBeenCalled();
  });
  it("does not acknowledge canceled retained IDs when permission resolution races logout", async () => {
    const f=fixture();f.setPending([{id:1,extra:{owner:"test-owner"}}]);
    let release!:(value:{display:string})=>void;let entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;});
    f.port.checkPermissions.mockImplementationOnce(()=>{entered();return new Promise(r=>{release=r;});});
    const sync=f.scheduler.sync(async()=>[request(1),request(2)]);await started;
    await f.scheduler.clear();release({display:"denied"});
    expect((await sync).acceptedIds).toEqual([]);expect(f.pending()).toEqual([]);
  });
  it("cancels a late partial native write even when its reply rejects after logout", async () => {
    const f=fixture();let release!:()=>void;let entered!:()=>void;
    const started=new Promise<void>(r=>{entered=r;});const wait=new Promise<void>(r=>{release=r;});
    f.port.schedule.mockImplementationOnce(async({notifications})=>{entered();await wait;f.setPending([notifications[0]]);throw new Error("lost reply");});
    const sync=f.scheduler.sync(async()=>[request(1)]);
    const rejected=expect(sync).rejects.toThrow("lost reply");await started;
    await f.scheduler.clear();release();await rejected;expect(f.pending()).toEqual([]);
  });
  it("per-task offline sync preserves other tasks and accepts only actual native IDs", async () => {
    const f=fixture();await f.scheduler.sync(async()=>[request(1)]);
    const result=await f.scheduler.sync(async()=>[request(2)],{cancelObsolete:false});
    expect(result.acceptedIds).toEqual([2]);expect(f.pending().map(n=>n.id)).toEqual([1,2]);
    expect(f.port.cancel).not.toHaveBeenCalled();
  });
  it("deduplicates identical requests, rejects conflicting/colliding IDs and malformed times", async () => {
    const f=fixture();await f.scheduler.sync(async()=>[request(1),request(1)]);
    expect(f.pending()).toHaveLength(1);
    await expect(f.scheduler.sync(async()=>[request(2),request(2,false)])).rejects.toThrow("Conflicting");
    await expect(f.scheduler.sync(async()=>[request(2,true,NaN)])).rejects.toThrow("Invalid");
    f.setPending([{id:2,extra:{owner:"other"}}]);
    await expect(f.scheduler.sync(async()=>[request(2)])).rejects.toThrow("another owner");
    expect(f.port.cancel).not.toHaveBeenCalled();
  });
});
