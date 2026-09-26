// Runs only inside the isolated Android QA WebView, never on a user's phone.
export async function dashboardUiQa() {
  const now=()=>globalThis.performance?.now?.()??Date.now(), started=now();
  const diagnostics={phase:'setup',categoryIndex:null,submitToObservedAckMs:[]};
  let awaitingAcknowledgement=false,lastSubmittedAt=0;
  const fail=message=>{
    const error=new Error(message);
    error.qaDiagnostics={...diagnostics,elapsedMs:Math.round(now()-started),
      code:message==='Dashboard task store is not writable'?'STORE_ERROR':message==='Dashboard form is invalid'?'FORM_INVALID':message==='Dashboard storage JSON is invalid'?'INVALID_JSON':'ASSERTION',
      storeReady:document.documentElement?.dataset?.taskStoreState==='ready',
      formOpen:Boolean(document.querySelector('#task-modal')?.classList.contains('open')),
      formBusy:document.querySelector('#task-form')?.getAttribute?.('aria-busy')==='true'};
    throw error;
  };
  const assert=(value,message)=>{if(!value)fail(message);};
  // Native RPC has a 10s bound. Observe acknowledgement for at most 8s, with
  // a separate 45s total deadline; never retry a submission or change records.
  const wait=async (check,message='Dashboard UI did not settle',limitMs=2000)=>{
    const end=Math.min(now()+limitMs,started+45000);
    for(let n=0;n<160;n++){
      if(document.documentElement?.dataset?.taskStoreState==='error')fail('Dashboard task store is not writable');
      if(awaitingAcknowledgement&&document.querySelector('#task-modal')?.classList.contains('open')&&document.querySelector('#task-form')?.matches?.(':invalid'))fail('Dashboard form is invalid');
      if(now()>end)break;
      if(check())return;
      await new Promise(r=>setTimeout(r,50));
    }
    fail(message);
  };
  const click=selector=>document.querySelector(selector).click();
  // Click in the same turn as the enabled check. A closed modal alone does not
  // prove a create: async alarm-mapping commits can temporarily disable opening.
  const clickReady=async (get,action=node=>node.click())=>wait(()=>{const node=get();if(!node||node.disabled)return false;action(node);return true;},'Dashboard control did not become enabled',8000);
  const records=()=>{let value;try{value=JSON.parse(localStorage.getItem('hamrah-local-v2')??'[]');}catch{fail('Dashboard storage JSON is invalid');}if(!Array.isArray(value))fail('Dashboard storage JSON is invalid');return value;};
  const modalOpen=()=>document.querySelector('#task-modal').classList.contains('open');
  const submit=()=>clickReady(()=>document.querySelector('#task-form [type="submit"]'),()=>{lastSubmittedAt=now();document.querySelector('#task-form').requestSubmit();awaitingAcknowledgement=true;});
  const counts=()=>[...document.querySelectorAll('.overview-card strong')].map(el=>Number(el.textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n))));
  click('button[data-panel="today"]');click('[data-filter="all"]');
  const stored=records();
  for(const task of stored.filter(t=>t.done))assert(!document.querySelector(`#task-list [data-id="${task.id}"],#dated-list [data-id="${task.id}"]`),'Persisted completed record reappeared after relaunch');
  const doneBefore=Number(document.querySelector('.overview-meeting small').textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n)).match(/\d+/)[0]);
  assert(document.querySelectorAll('.overview-card').length===4,'Four dashboard cards missing');
  assert([...document.querySelectorAll('.overview-card > span')].map(el=>el.textContent).join('|')==='ALL TASKS|PERSONAL|BUSINESS|MEETING','Dashboard labels differ');
  const poem=document.querySelector('#page-title'), before=poem.textContent;
  click('#poem-next');const selected=poem.textContent;assert(selected!==before,'Next poem did not advance');
  const saved=JSON.parse(localStorage.getItem('hamrah.poem.v1'));
  assert(window.HamrahPoems[saved.index].join('')===selected,'Rendered and saved poem differ');
  click('button[data-panel="tasks"]');assert(document.querySelector('#poem-next').hidden,'Next control visible outside poem');
  click('button[data-panel="today"]');assert(poem.textContent===selected,'Poem lost when switching tabs');
  const index=window.HamrahOverview.createPoemNavigator(360,localStorage).current();
  assert(index===saved.index,'Poem preference lost on controller restart');
  const baseline=counts(), prefix='آزمون باکس ', createdIds=new Map();
  const wall=window.HamrahOffline.localDateInput(new Date());
  for(const category of ['personal','company','meeting']){
    diagnostics.phase='create';diagnostics.categoryIndex=createdIds.size;
    const previousIds=new Set(records().map(task=>task.id));
    await clickReady(()=>document.querySelector('[data-open-form]'));
    await wait(modalOpen,'Create form did not open');
    assert(document.querySelector('#task-id').value==='','Create form retained an existing record');
    document.querySelector('#task-title').value=prefix+category;
    document.querySelector('#task-category').value=category;
    const date=document.querySelector('#task-date-control input'),time=document.querySelector('#task-time-control input');
    date.value=window.HamrahInputs.dateInputValue(wall.split('T')[0]);date.dispatchEvent(new Event('input',{bubbles:true}));
    time.value=wall.split('T')[1];time.dispatchEvent(new Event('input',{bubbles:true}));
    await submit();const submitted=lastSubmittedAt;
    await wait(()=>!modalOpen()&&records().some(task=>!previousIds.has(task.id)&&task.title===prefix+category&&task.category===category&&!task.done&&!task.archived),'New dashboard record was not acknowledged',8000);
    diagnostics.submitToObservedAckMs.push(Math.round(now()-submitted));
    awaitingAcknowledgement=false;
    const created=records().filter(task=>!previousIds.has(task.id));
    assert(created.length===1,'Dashboard create did not persist exactly one new record');
    createdIds.set(category,created[0].id);
    assert([...document.querySelectorAll('#task-list .item')].some(el=>el.dataset.id===created[0].id),'Created dashboard record is absent from active list');
  }
  const totals=counts();assert(totals.every((v,i)=>v===baseline[i]+(i===0?3:1)),'Created records are not reflected in scoped counts');
  click('[data-filter="company"]');const business=counts();assert(business[0]===business[2]&&business[1]===0&&business[3]===0,'Filtered counters do not match list');
  click('[data-filter="all"]');
  const find=category=>[...document.querySelectorAll('#task-list .item')].find(el=>el.dataset.id===createdIds.get(category));
  const completedId=find('meeting').dataset.id;
  diagnostics.phase='complete';
  await clickReady(()=>find('meeting')?.querySelector('[data-action="toggle"]'),complete=>{complete.click();complete.click();});
  await wait(()=>!find('meeting'),'Dashboard completion was not acknowledged',8000);
  assert(JSON.parse(localStorage.getItem('hamrah-local-v2')).find(t=>t.id===completedId)?.done,'Completion was not persisted after rapid clicks');
  assert(counts()[0]===totals[0]-1&&counts()[3]===totals[3]-1,'Completed meeting still in remaining counters');
  const doneAfter=Number(document.querySelector('.overview-meeting small').textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n)).match(/\d+/)[0]);
  assert(doneAfter===doneBefore+1,'Completed meeting count missing');
  click('button[data-panel="tasks"]');assert(!find('meeting'),'Completed meeting reappeared in Tasks');
  click('button[data-panel="calendar"]');assert(!document.querySelector(`#dated-list [data-id="${completedId}"]`),'Completed meeting remains in calendar');
  click('button[data-panel="today"]');
  diagnostics.phase='edit';
  const beforeEdit=counts();await clickReady(()=>find('personal')?.querySelector('[data-action="edit"]'));
  await wait(()=>modalOpen()&&document.querySelector('#task-id').value===createdIds.get('personal'),'Edit form did not open for the created record');
  document.querySelector('#task-category').value='company';await submit();
  await wait(()=>!modalOpen()&&records().find(task=>task.id===createdIds.get('personal'))?.category==='company'&&counts()[1]===beforeEdit[1]-1,'Dashboard edit was not acknowledged',8000);assert(counts()[2]===beforeEdit[2]+1,'Editing category did not recount');
  awaitingAcknowledgement=false;
  for(const category of ['personal','company']){
    diagnostics.phase='archive';
    await clickReady(()=>find(category)?.querySelector('[data-action="delete"]'));
    await clickReady(()=>find(category)?.querySelector('[data-action="confirm-delete"]'));
    await wait(()=>!find(category)&&records().find(task=>task.id===createdIds.get(category))?.archived===true,'Dashboard archive was not acknowledged',8000);
  }
  assert(counts().every((v,i)=>v===baseline[i]),'Deleting synthetic records did not restore counts');
  assert(JSON.parse(localStorage.getItem('hamrah-local-v2')).some(t=>t.id===completedId&&t.done),'Completed history was deleted');
  return {fourCards:true,todayScope:true,filteredScope:true,createEditCompleteDelete:true,completedCountsOnly:true,rapidCompletion:true,completedId,nextPoem:true,sameDayPersistence:true,submitToObservedAckMs:diagnostics.submitToObservedAckMs};
}
