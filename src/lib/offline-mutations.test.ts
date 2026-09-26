import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as planner from "./agent-planner";
import * as inputs from "./persian-inputs";
import { createDeviceAlarmScheduler, type ScheduledDeviceAlarm } from "./device-alarm-scheduler";

const app = readFileSync("mobile-shell/app.js", "utf8");
const part = (start: string, end: string) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
type Task = { id: string; title: string; category: string; priority: string; done: boolean; deadline: string; updatedAt: string;
  archived?: boolean; notificationIds: number[]; notificationSchedule?: {version: number; entries: {id: number; at: number}[]};
  alarmCancellations?: {id: number; taskId: string}[]; approvalReceipt?: {id: string; revision: number}; approvedPlan?: planner.Plan };
const oldTask = (): Task => ({ id:"old",title:"قبلی",category:"personal",priority:"normal",done:false,
  deadline:"2099-01-02T09:00:00.000Z",updatedAt:"2026-09-26T00:00:00.000Z",notificationIds:[101],
  notificationSchedule:{version:1,entries:[{id:101,at:Date.parse("2099-01-02T08:00:00Z")}]},
});
const alarm = (id = 101, owner = "hamrah-local", taskId = "old"): ScheduledDeviceAlarm => ({id,title:"قبلی",body:"ساختگی",
  channelId:"saved-sound",smallIcon:"test",autoCancel:true,schedule:{at:new Date("2099-01-02T08:00:00Z"),allowWhileIdle:true},extra:{owner,taskId},
});
const plan = (operation: planner.Plan["operation"] = "UPDATE"): planner.Plan => ({
  ...planner.planPersian("فردا ساعت ۱۲ کار بررسی",{timezone:"Asia/Tehran"}).plan!,
  operation, title:"تأییدشده", date:"2099-01-02",time:"12:30",durationMinutes:null,recurrence:"NONE",occurrenceCount:null,
  entity:"TASK",category:"PERSONAL",priority:"NORMAL",channels:["ALARM"],reminderOffsets:[60],
  targetId:operation==="CREATE"?null:"old",targetUpdatedAt:operation==="CREATE"?null:oldTask().updatedAt,
  quietStart:"00:00",quietEnd:"00:00",repeatCount:0,repeatMinutes:15,escalation:false,ambiguousTime:null,
});
type Node = { disabled:boolean; textContent:string; value:string; onclick?:()=>Promise<void>|void; classList:{toggle:()=>void} };

function fixture(initial: Task[] = [oldTask()], native: ScheduledDeviceAlarm[] = [alarm()], persistedDraft?: string, delivered: {id:number;tag?:string|null}[] = []) {
  const values = new Map<string,string>([["hamrah-local-v2",JSON.stringify(initial)]]);
  const draft = {id:"approval",revision:1,status:"PENDING",plan:plan(),questions:[]};
  values.set("hamrah-confirmed-local-draft-v1",persistedDraft || JSON.stringify(draft));
  const state = { tasks: [] as Task[], pending:structuredClone(native), delivered:structuredClone(delivered), denyTasks:false, denyDraft:false, open:true, writes:0 };
  const localStorage = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{
    if(key==="hamrah-local-v2" && state.denyTasks || key==="hamrah-confirmed-local-draft-v1" && state.denyDraft)throw Error("synthetic quota");
    values.set(key,value);if(key==="hamrah-local-v2")state.writes++;
  }};
  const nodes = new Map<string,Node>();
  const $ = (id:string) => {if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:"",value:"",classList:{toggle:()=>{}}});return nodes.get(id)!;};
  const controls = [$("#local-plan-confirm"),$("#local-plan-cancel"),$("edit")];
  const root = {setAttribute:vi.fn(),querySelectorAll:(selector:string)=>selector==="input,select,button"?controls:[],querySelector:()=>null};
  const localNotifications = {
    getPending:vi.fn(async()=>({notifications:structuredClone(state.pending)})),
    checkPermissions:vi.fn(async()=>({display:"granted"})),createChannel:vi.fn(async()=>{}),
    cancel:vi.fn(async({notifications}:{notifications:{id:number}[]})=>{state.pending=state.pending.filter(p=>!notifications.some(n=>n.id===p.id)||state.delivered.some(d=>d.id===p.id));}),
    getDeliveredNotifications:vi.fn(async()=>({notifications:structuredClone(state.delivered)})),
    removeDeliveredNotifications:vi.fn(async({notifications}:{notifications:{id:number;tag?:string|null}[]})=>{
      state.delivered=state.delivered.filter(d=>!notifications.some(n=>n.id===d.id && n.tag==d.tag));
      state.pending=state.pending.filter(p=>!notifications.some(n=>n.id===p.id));
    }),
    schedule:vi.fn(async({notifications}:{notifications:ScheduledDeviceAlarm[]})=>{state.pending.push(...notifications);}),
  };
  const formValues = new Map(Object.entries({id:"old",title:"ویرایش دستی",category:"personal",priority:"normal",deadline:"2099-01-03T09:00"}));
  let submit!: (event:{preventDefault:()=>void})=>Promise<void>, nextId = 1000;
  const form = {submitGeneration:0,querySelector:()=>$("submit"),addEventListener:(_type:string,handler:typeof submit)=>{submit=handler;}};
  const context = vm.createContext({window:{HamrahPlanner:planner,HamrahInputs:inputs},localStorage,Date,crypto,setTimeout,clearTimeout,
    planner,domain:undefined,taskStore:undefined,$,$$:()=>[],root,controls,form,FormData:class{get(key:string){return formValues.get(key);}},
    modal:{classList:{contains:()=>state.open}},storageWarning:{hidden:true},storageFailure:vi.fn(),
    pendingActions:new Set(),pendingDelete:"",filter:"all",repeatSettings:null,reminderOffsets:[60],
    localNotifications,alarmSounds:{createDeviceAlarmScheduler,prepareAlarm:async()=>({channelId:"new-sound",sound:"sound",legacySound:false})},
    alarmStatus:$("alarm"),channelId:"test",notificationId:()=>++nextId,ensureNotificationAccess:async()=>true,
    render:vi.fn(),showPanel:vi.fn(),closeForm:()=>{state.open=false;},openForm:vi.fn(),
    agentBusy:false,agentDraft:JSON.parse(values.get("hamrah-confirmed-local-draft-v1")!),draftKey:"hamrah-confirmed-local-draft-v1",
    p:JSON.parse(values.get("hamrah-confirmed-local-draft-v1")!).plan,details:{open:false},statusNode:$("#local-plan-status"),
    showAgentDraft:vi.fn(),toFa:String,
  });
  vm.runInContext(readFileSync("mobile-shell/storage.js","utf8"),context);
  vm.runInContext(readFileSync("mobile-shell/domain.js","utf8"),context);
  context.taskStore=context.window.HamrahStorage.createTaskStore(localStorage);
  context.domain=context.window.HamrahOffline;
  state.tasks=context.taskStore.load().tasks;
  Object.defineProperty(context,"tasks",{get:()=>state.tasks,set:value=>{state.tasks=value;}});
  // Execute the real handlers, task store and scheduler; no production storage or transport.
  vm.runInContext(part("  function saveTasks", "  function notificationId")+
    part("  // Keep mapping persistence", "  function taskMarkup(")+
    part('  form.addEventListener("submit"', "  list.addEventListener")+
    part("  function immutablePlan", "  function showAgentDraft"),context);
  function approve(value = plan()) {
    const next={id:"approval",revision:1,status:"PENDING",plan:value,questions:[]};
    values.set("hamrah-confirmed-local-draft-v1",JSON.stringify(next));context.agentDraft=next;context.p=next.plan;
    vm.runInContext(app.slice(app.indexOf('    $("#local-plan-cancel").onclick='),app.indexOf("  function replyToMessage")).replace(/\s*}\s*$/,""),context);
  }
  approve(context.p);
  const click = (action:string) => context.handleListAction({target:{closest:()=>({dataset:{action},closest:()=>({dataset:{id:"old"}})})}}) as Promise<void>;
  return {state,values,context,localNotifications,formValues,nodes,controls,$,root,approve,
    submit:()=>submit({preventDefault:()=>{}}),click,confirm:()=>$("#local-plan-confirm").onclick!(),
    retry:()=>context.retryLocalAlarms() as Promise<number>,
    saved:()=>JSON.parse(values.get("hamrah-local-v2")!) as Task[],
    reload:()=>fixture(JSON.parse(values.get("hamrah-local-v2")!),state.pending,values.get("hamrah-confirmed-local-draft-v1"),state.delivered),
  };
}
afterEach(()=>vi.useRealTimers());

describe("durable offline mutations through actual handlers",()=>{
  it.each(["edit","toggle","confirm-delete","approval"])("failed %s persistence preserves native alarms and permits one retry",async action=>{
    vi.useFakeTimers();const f=fixture();const before=f.values.get("hamrah-local-v2");f.state.denyTasks=true;
    const perform=()=>action==="edit"?f.submit():action==="approval"?f.confirm():f.click(action);
    await perform();expect(f.values.get("hamrah-local-v2")).toBe(before);expect(f.localNotifications.cancel).not.toHaveBeenCalled();
    expect(f.localNotifications.schedule).not.toHaveBeenCalled();expect(f.state.pending).toHaveLength(1);
    expect(JSON.parse(f.values.get("hamrah-confirmed-local-draft-v1")!).status).toBe("PENDING");
    f.state.denyTasks=false;await perform();expect(f.saved()).toHaveLength(1);
    expect(f.localNotifications.cancel).toHaveBeenCalledOnce();
  });
  it.each(["before","after"])("survives cancellation failure %s its native effect and drains on reload before replacements",async when=>{
    vi.useFakeTimers();const f=fixture();
    f.localNotifications.cancel.mockImplementationOnce(async()=>{
      expect(f.saved()[0]).toMatchObject({title:"ویرایش دستی",alarmCancellations:[{id:101,taskId:"old"}]});
      if(when==="after")f.state.pending=[];
      throw Error("lost native reply");
    });
    await f.submit();expect(f.saved()[0].alarmCancellations).toHaveLength(1);expect(f.localNotifications.schedule).not.toHaveBeenCalled();
    const reloaded=f.reload();await reloaded.retry();
    expect(reloaded.saved()[0].alarmCancellations).toEqual([]);expect(reloaded.state.pending).toHaveLength(3);
    const mapping=reloaded.saved()[0].notificationSchedule;
    await reloaded.retry();expect(reloaded.saved()[0].notificationSchedule).toEqual(mapping);expect(reloaded.localNotifications.schedule).toHaveBeenCalledOnce();
    if(when==="before")expect(reloaded.localNotifications.cancel.mock.invocationCallOrder[0]).toBeLessThan(reloaded.localNotifications.schedule.mock.invocationCallOrder[0]);
  });
  it("retains cancellation receipts if their acknowledgement cannot persist",async()=>{
    vi.useFakeTimers();const f=fixture();f.localNotifications.cancel.mockImplementationOnce(async()=>{f.state.pending=[];f.state.denyTasks=true;});
    await f.submit();expect(f.saved()[0].alarmCancellations).toHaveLength(1);expect(f.localNotifications.schedule).not.toHaveBeenCalled();
    const reloaded=f.reload();await reloaded.retry();expect(reloaded.saved()[0].alarmCancellations).toEqual([]);
    expect(reloaded.localNotifications.cancel).not.toHaveBeenCalled();expect(reloaded.state.pending).toHaveLength(3);
  });
  it.each(["toggle","confirm-delete"])("retains %s history and drains hidden records after reload, without resurrection",async action=>{
    const f=fixture();f.localNotifications.cancel.mockRejectedValueOnce(Error("offline bridge"));
    await Promise.all([f.click(action),f.click(action)]);expect(f.saved()).toHaveLength(1);
    expect(f.saved()[0][action==="toggle"?"done":"archived"]).toBe(true);expect(f.saved()[0].alarmCancellations).toHaveLength(1);
    const reload=f.reload();await reload.retry();expect(reload.state.pending).toEqual([]);expect(reload.saved()).toHaveLength(1);
    expect(reload.localNotifications.schedule).not.toHaveBeenCalled();
  });
  it.each([alarm(101,"hamrah-approved-reminders","account"),alarm(101,"hamrah-local","other")])("does not cancel a reused numeric ID owned by another record",async foreign=>{
    const f=fixture([oldTask()],[foreign]);await f.click("toggle");expect(f.state.pending).toEqual([foreign]);
    expect(f.localNotifications.cancel).not.toHaveBeenCalled();expect(f.saved()[0].done).toBe(true);
  });
  it("fences late scheduling with a durable completion and retains all other tasks",async()=>{
    const f=fixture([{...oldTask(),notificationIds:[],notificationSchedule:undefined}],[]);
    let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;}),wait=new Promise<void>(r=>{release=r;});
    f.localNotifications.schedule.mockImplementationOnce(async({notifications})=>{enter();await wait;f.state.pending.push(...notifications);});
    const scheduled=f.context.scheduleNotification(f.state.tasks[0]);await entered;
    const completed=f.click("toggle");expect(f.saved()[0].done).toBe(true);expect(f.saved()[0].alarmCancellations!.length).toBeGreaterThan(0);
    release();await Promise.all([scheduled,completed]);expect(f.state.pending).toEqual([]);expect(f.saved()[0].done).toBe(true);
  });
  it("preserves the immutable approval, blocks cancel/edit callbacks and rapid confirmations while native work waits",async()=>{
    const f=fixture();let enter!:()=>void,release!:()=>void;const entered=new Promise<void>(r=>{enter=r;}),wait=new Promise<void>(r=>{release=r;});
    f.localNotifications.cancel.mockImplementationOnce(async()=>{enter();await wait;f.state.pending=[];});
    const pending=f.confirm();await entered;expect(f.controls.every(node=>node.disabled)).toBe(true);
    expect(f.saved()[0]).toMatchObject({title:"تأییدشده",approvalReceipt:{id:"approval",revision:1}});
    await f.$("#local-plan-cancel").onclick!();await f.confirm();f.context.p.title="تأییدنشده";f.context.p.channels.push("PUSH");
    expect(Object.isFrozen(f.state.tasks[0].approvedPlan)).toBe(true);
    release();await pending;expect(f.saved()[0].title).toBe("تأییدشده");expect(f.saved()[0].approvedPlan!.channels).toEqual(["ALARM"]);
    expect(f.localNotifications.cancel).toHaveBeenCalledOnce();expect(f.saved()).toHaveLength(1);
  });
  it("a failed draft acknowledgement cannot repeat a committed create after reload",async()=>{
    const f=fixture([],[]);f.approve(plan("CREATE"));f.state.denyDraft=true;await f.confirm();
    expect(f.saved()).toHaveLength(1);expect(JSON.parse(f.values.get("hamrah-confirmed-local-draft-v1")!).status).toBe("PENDING");
    const reload=f.reload();await reload.confirm();expect(reload.saved()).toHaveLength(1);expect(reload.localNotifications.schedule).not.toHaveBeenCalled();
  });
  it("never overwrites an independently changed task-store during acknowledgement",async()=>{
    const f=fixture();const separate=JSON.stringify([{...oldTask(),id:"other",title:"newer real data",notificationIds:[]}]);
    f.localNotifications.cancel.mockImplementationOnce(async()=>{f.state.pending=[];f.values.set("hamrah-local-v2",separate);});
    await f.click("toggle");expect(f.values.get("hamrah-local-v2")).toBe(separate);expect(f.localNotifications.schedule).not.toHaveBeenCalled();
  });
  it("retains exact prior mapping and sound on a title-only edit without replaying an expired entry",async()=>{
    vi.useFakeTimers();const task=oldTask();task.notificationIds.push(102);task.notificationSchedule!.entries.push({id:102,at:1});
    const f=fixture([task]);f.formValues.set("deadline",f.context.domain.localDateInput(task.deadline));await f.submit();
    expect(f.saved()[0].notificationSchedule).toEqual(task.notificationSchedule);expect(f.state.pending[0].channelId).toBe("saved-sound");
    expect(f.localNotifications.cancel).not.toHaveBeenCalled();expect(f.localNotifications.schedule).not.toHaveBeenCalled();
  });
  it("does not schedule a replacement when native cancellation falsely reports success",async()=>{
    vi.useFakeTimers();const f=fixture();f.localNotifications.cancel.mockResolvedValueOnce(undefined);await f.submit();
    expect(f.saved()[0].alarmCancellations).toHaveLength(1);expect(f.localNotifications.schedule).not.toHaveBeenCalled();
    const reload=f.reload();await reload.retry();expect(reload.saved()[0].alarmCancellations).toEqual([]);
  });
  it("unknown cancellation ownership fails closed and retains its receipt",async()=>{
    vi.useFakeTimers();const legacy=alarm();delete legacy.extra!.taskId;const f=fixture([oldTask()],[legacy]);await f.submit();
    expect(f.saved()[0].alarmCancellations).toHaveLength(1);expect(f.localNotifications.cancel).not.toHaveBeenCalled();
    expect(f.localNotifications.schedule).not.toHaveBeenCalled();await expect(f.retry()).rejects.toThrow("احراز نشد");
  });
});

describe("Capacitor retained-delivered cancellation",()=>{
  it("drains delivered A then future B before retaining active C, including reload",async()=>{
    const a={...oldTask(),done:true,alarmCancellations:[{id:101,taskId:"old"}]};
    const b={...oldTask(),id:"B",done:true,notificationIds:[102],notificationSchedule:{version:1,entries:[{id:102,at:Date.parse("2099-01-02T08:00:00Z")}]},alarmCancellations:[{id:102,taskId:"B"}]};
    const c={...oldTask(),id:"C",notificationIds:[103],notificationSchedule:{version:1,entries:[{id:103,at:Date.parse("2099-01-02T08:00:00Z")}]}};
    const f=fixture([a,b,c],[alarm(),alarm(102,"hamrah-local","B"),alarm(103,"hamrah-local","C")],undefined,[{id:101,tag:null}]);
    await f.retry();
    expect(f.state.pending.map(n=>n.id)).toEqual([103]);expect(f.state.delivered).toEqual([]);
    expect(f.saved()).toHaveLength(3);expect(f.saved().slice(0,2).every(t=>t.alarmCancellations?.length===0)).toBe(true);
    expect(f.localNotifications.removeDeliveredNotifications).toHaveBeenCalledWith({notifications:[{id:101,tag:null}]});
    const reload=f.reload();await reload.retry();expect(reload.state.pending.map(n=>n.id)).toEqual([103]);
    expect(reload.localNotifications.schedule).not.toHaveBeenCalled();
  });
  it("real completion clears delivered source storage, but no reused/foreign tagged notification",async()=>{
    const f=fixture([oldTask()],[alarm(),alarm(102,"hamrah-local","other")],undefined,[{id:101,tag:null},{id:101,tag:"foreign"}]);
    await f.click("toggle");expect(f.saved()[0].done).toBe(true);expect(f.saved()[0].alarmCancellations).toEqual([]);
    expect(f.state.pending.map(n=>n.id)).toEqual([102]);expect(f.state.delivered).toEqual([{id:101,tag:"foreign"}]);
  });
  it.each(["read","remove","unknown"])("keeps the receipt on delivered %s failure and retries on reload",async phase=>{
    const f=fixture([oldTask()],[alarm()],undefined,[{id:101}]);
    if(phase==="read")f.localNotifications.getDeliveredNotifications.mockRejectedValueOnce(Error("lost reply"));
    else if(phase==="remove")f.localNotifications.removeDeliveredNotifications.mockRejectedValueOnce(Error("lost reply"));
    else f.localNotifications.removeDeliveredNotifications.mockResolvedValueOnce(undefined);
    await f.click("toggle");expect(f.saved()[0].alarmCancellations).toHaveLength(1);
    expect(f.localNotifications.schedule).not.toHaveBeenCalled();const reload=f.reload();await reload.retry();
    expect(reload.state.pending).toEqual([]);expect(reload.state.delivered).toEqual([]);expect(reload.saved()[0].alarmCancellations).toEqual([]);
  });
});

describe("bundled date/time approval callbacks",()=>{
  it("persists normalized TASK-to-MEETING defaults before confirming that exact revision",async()=>{
    const f=fixture([],[]);f.approve(plan("CREATE"));
    const createElement=()=>({textContent:"",value:"",append:()=>{},add:()=>{},onchange:undefined});
    f.context.document={createElement};f.context.Option=class{};f.context.grid={append:()=>{}};
    f.context.window.HamrahControls={date:()=>{},time:()=>{}};f.context.updatePreview=vi.fn();
    vm.runInContext(part("    const changed=", "    const actions=root.querySelector")+';categorySelect.value="MEETING";categorySelect.onchange();',f.context);
    const draft=JSON.parse(f.values.get("hamrah-confirmed-local-draft-v1")!);
    expect(draft).toMatchObject({revision:2,plan:{entity:"MEETING",durationMinutes:60}});
    expect(draft.plan).toEqual(f.context.p);await f.confirm();
    expect(f.saved()).toHaveLength(1);expect(f.saved()[0]).toMatchObject({category:"meeting",approvalReceipt:{revision:2}});
  });
  it("updates revisions without replacing the active input and ignores edits while busy",()=>{
    const f=fixture();const callbacks=new Map<string,(value:string)=>void>();
    const createElement=()=>({textContent:"",value:"",append:()=>{},add:()=>{},onchange:undefined});
    f.context.document={createElement};f.context.Option=class{};f.context.grid={append:()=>{}};
    f.context.window.HamrahControls=Object.fromEntries(["date","time"].map(key=>[key,(_root:unknown,_value:string,changed:(value:string)=>void)=>callbacks.set(key,changed)]));
    f.context.updatePreview=vi.fn();
    vm.runInContext(part("    const changed=", "    const actions=root.querySelector"),f.context);
    for(const value of ["invalid:۱","invalid:۱۴","invalid:۱۴۰۵/۰۷/","2026-10-07"])callbacks.get("date")!(value);
    for(const value of ["1","12","12:","12:3","12:30"])callbacks.get("time")!(value);
    expect(f.context.showAgentDraft).not.toHaveBeenCalled();expect(f.context.updatePreview).toHaveBeenCalledTimes(9);
    const stored=JSON.parse(f.values.get("hamrah-confirmed-local-draft-v1")!);
    expect(stored).toMatchObject({revision:10,plan:{date:"2026-10-07",time:"12:30"}});
    f.context.agentBusy=true;callbacks.get("date")!("2099-01-01");expect(f.values.get("hamrah-confirmed-local-draft-v1")).toBe(JSON.stringify(stored));
  });
});
