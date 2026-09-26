// Runs only inside the isolated Android QA WebView, never on a user's phone.
export async function dashboardUiQa() {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const wait=async (check,message='Dashboard UI did not settle')=>{for(let n=0;n<40;n++){if(check())return;await new Promise(r=>setTimeout(r,50));}throw Error(message);};
  const click=selector=>document.querySelector(selector).click();
  // Click in the same turn as the enabled check. A closed modal alone does not
  // prove a create: async alarm-mapping commits can temporarily disable opening.
  const clickReady=async (get,action=node=>node.click())=>wait(()=>{const node=get();if(!node||node.disabled)return false;action(node);return true;},'Dashboard control did not become enabled');
  const records=()=>JSON.parse(localStorage.getItem('hamrah-local-v2')??'[]');
  const modalOpen=()=>document.querySelector('#task-modal').classList.contains('open');
  const submit=()=>clickReady(()=>document.querySelector('#task-form [type="submit"]'),()=>document.querySelector('#task-form').requestSubmit());
  const counts=()=>[...document.querySelectorAll('.overview-card strong')].map(el=>Number(el.textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n))));
  click('button[data-panel="today"]');click('[data-filter="all"]');
  const stored=JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]');
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
    const previousIds=new Set(records().map(task=>task.id));
    await clickReady(()=>document.querySelector('[data-open-form]'));
    await wait(modalOpen,'Create form did not open');
    assert(document.querySelector('#task-id').value==='','Create form retained an existing record');
    document.querySelector('#task-title').value=prefix+category;
    document.querySelector('#task-category').value=category;
    const date=document.querySelector('#task-date-control input'),time=document.querySelector('#task-time-control input');
    date.value=window.HamrahInputs.dateInputValue(wall.split('T')[0]);date.dispatchEvent(new Event('input',{bubbles:true}));
    time.value=wall.split('T')[1];time.dispatchEvent(new Event('input',{bubbles:true}));
    await submit();
    await wait(()=>!modalOpen()&&records().some(task=>!previousIds.has(task.id)&&task.title===prefix+category&&task.category===category&&!task.done&&!task.archived),'New dashboard record was not acknowledged');
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
  await clickReady(()=>find('meeting')?.querySelector('[data-action="toggle"]'),complete=>{complete.click();complete.click();});
  await wait(()=>!find('meeting'));
  assert(JSON.parse(localStorage.getItem('hamrah-local-v2')).find(t=>t.id===completedId)?.done,'Completion was not persisted after rapid clicks');
  assert(counts()[0]===totals[0]-1&&counts()[3]===totals[3]-1,'Completed meeting still in remaining counters');
  const doneAfter=Number(document.querySelector('.overview-meeting small').textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n)).match(/\d+/)[0]);
  assert(doneAfter===doneBefore+1,'Completed meeting count missing');
  click('button[data-panel="tasks"]');assert(!find('meeting'),'Completed meeting reappeared in Tasks');
  click('button[data-panel="calendar"]');assert(!document.querySelector(`#dated-list [data-id="${completedId}"]`),'Completed meeting remains in calendar');
  click('button[data-panel="today"]');
  const beforeEdit=counts();await clickReady(()=>find('personal')?.querySelector('[data-action="edit"]'));
  await wait(()=>modalOpen()&&document.querySelector('#task-id').value===createdIds.get('personal'),'Edit form did not open for the created record');
  document.querySelector('#task-category').value='company';await submit();
  await wait(()=>!modalOpen()&&records().find(task=>task.id===createdIds.get('personal'))?.category==='company'&&counts()[1]===beforeEdit[1]-1);assert(counts()[2]===beforeEdit[2]+1,'Editing category did not recount');
  for(const category of ['personal','company']){
    await clickReady(()=>find(category)?.querySelector('[data-action="delete"]'));
    await clickReady(()=>find(category)?.querySelector('[data-action="confirm-delete"]'));
    await wait(()=>!find(category)&&records().find(task=>task.id===createdIds.get(category))?.archived===true);
  }
  assert(counts().every((v,i)=>v===baseline[i]),'Deleting synthetic records did not restore counts');
  assert(JSON.parse(localStorage.getItem('hamrah-local-v2')).some(t=>t.id===completedId&&t.done),'Completed history was deleted');
  return {fourCards:true,todayScope:true,filteredScope:true,createEditCompleteDelete:true,completedCountsOnly:true,rapidCompletion:true,completedId,nextPoem:true,sameDayPersistence:true};
}
