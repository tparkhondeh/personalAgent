// Synthetic accounts only. Retain records to verify that completion is not deletion.
import assert from 'node:assert/strict';
import { selectDashboardItems, selectDashboardScope, summarizeDashboardItems } from '../src/lib/dashboard-overview.ts';
const base=process.env.QA_BASE_URL||'http://localhost:3001';
assert(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||base==='https://personalagent.wealthos.ir:8443');
const email=`completed-qa-${Date.now()}@example.invalid`, password='Synthetic-completed-QA-only-20260910';
let cookie='', checks=0;
async function call(path,method='GET',body){
  const r=await fetch(base+path,{method,headers:{origin:base,cookie,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error(`${method} ${path}: ${r.status} ${await r.text()}`);checks++;
  if(path.startsWith('/api/auth/'))cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const json=await r.json();return json.data;
}
await call('/api/auth/sign-up/email','POST',{name:'آزمون انجام‌شده‌ها',email,password});
const prefs={timezone:'Asia/Tehran',locale:'fa-IR',workdayStartsAt:'09:00',workdayEndsAt:'18:00',workingDays:['SAT','SUN'],defaultReminderMins:60,defaultReminderOffsets:[1440,180,60],urgentEscalationEnabled:true,urgentRepeatMinutes:15,urgentMaxRepeats:3,androidAlarmEnabled:true,highPriorityEnabled:true,smsEscalationEnabled:false,callEscalationEnabled:false,emergencyContactName:null,emergencyPhone:null};
await call('/api/preferences','PUT',{...prefs,quietHoursStartsAt:'00:00',quietHoursEndsAt:'00:00'});
const future=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
for(const [kind,subject] of [['tasks','گزارش کنترل فهرست'],['meetings','جلسه با تیم کنترل']]){
  const draft=await call('/api/agent','POST',{message:`${future} ساعت 17 ${subject} ثبت کن؛ یک روز قبل، سه ساعت قبل و یک ساعت قبل یادم بنداز و آلارم هم بگذار.`,localOnly:true});
  const created=await call(`/api/agent/drafts/${draft.draft.id}`,'POST',{action:'confirm',revision:1,confirmed:true});
  const alarmIds=(await call('/api/agent/alarms')).map(a=>a.id);assert.equal(alarmIds.length,3);
  await Promise.all([call(`/api/${kind}/${created.entityId}`,'PATCH',{status:'DONE'}),call(`/api/${kind}/${created.entityId}`,'PATCH',{status:'DONE'})]);
  assert(!(await call('/api/agent/alarms')).some(a=>alarmIds.includes(a.id)),'Completed reminders survived');
  const persisted=(await call(`/api/${kind}`)).find(t=>t.id===created.entityId);assert.equal(persisted.status,'DONE');
  const restored=JSON.parse(JSON.stringify([{...persisted,category:kind==='meetings'?'meeting':'personal',done:persisted.status==='DONE'}]));
  assert.equal(selectDashboardItems(restored,'tasks').length,0);assert.equal(selectDashboardItems(restored,'calendar').length,0);
  assert.deepEqual(summarizeDashboardItems(selectDashboardScope(restored,'tasks'))[0].done,1);
}
const urgent=await call('/api/tasks','POST',{title:'آزمون لغو پیگیری پس از تکمیل',category:'WORK',priority:'URGENT',dueAt:new Date(Date.now()-300000).toISOString()});
await call('/api/escalations','POST');assert.equal((await call('/api/escalations')).alarms.length,3);
await call(`/api/tasks/${urgent.id}`,'PATCH',{status:'DONE'});
await call('/api/escalations','POST');assert.equal((await call('/api/escalations')).alarms.length,0);
assert.equal((await call('/api/tasks')).find(t=>t.id===urgent.id).status,'DONE');
if(process.env.QA_UI_FIXTURES==='true'){
  const time=new Date(Date.now()+30*60000).toISOString();
  for(const [category,title] of [['PERSONAL','آزمون شخصی قابل تکمیل'],['WORK','آزمون شرکتی قابل تکمیل']])await call('/api/tasks','POST',{title,category,priority:'NORMAL',dueAt:time});
  await call('/api/meetings','POST',{title:'جلسه آزمون قابل تکمیل',startsAt:time,endsAt:new Date(Date.parse(time)+3600000).toISOString(),timezone:'Asia/Tehran'});
}
console.log(JSON.stringify({passed:true,checks,target:base,syntheticAccount:email,retainedCompletedRecords:3,coverage:['task-and-meeting','three-reminders-cancelled','rapid-repeat-completion','no-escalation-replay','reload-selection','remaining-vs-done-counts','history-preserved']}));
