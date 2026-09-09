// Runs only inside the isolated Android QA WebView, never on a user's phone.
export async function dashboardUiQa() {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const wait=async check=>{for(let n=0;n<40;n++){if(check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Dashboard UI did not settle');};
  const click=selector=>document.querySelector(selector).click();
  const counts=()=>[...document.querySelectorAll('.overview-card strong')].map(el=>Number(el.textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n))));
  click('[data-panel="today"]');click('[data-filter="all"]');
  const stored=JSON.parse(localStorage.getItem('hamrah-local-v2')||'[]');
  for(const task of stored.filter(t=>t.done))assert(!document.querySelector(`#task-list [data-id="${task.id}"],#dated-list [data-id="${task.id}"]`),'Persisted completed record reappeared after relaunch');
  const doneBefore=Number(document.querySelector('.overview-meeting small').textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n)).match(/\d+/)[0]);
  assert(document.querySelectorAll('.overview-card').length===4,'Four dashboard cards missing');
  assert([...document.querySelectorAll('.overview-card > span')].map(el=>el.textContent).join('|')==='ALL TASKS|PERSONAL|BUSINESS|MEETING','Dashboard labels differ');
  const poem=document.querySelector('#page-title'), before=poem.textContent;
  click('#poem-next');const selected=poem.textContent;assert(selected!==before,'Next poem did not advance');
  const saved=JSON.parse(localStorage.getItem('hamrah.poem.v1'));
  assert(window.HamrahPoems[saved.index].join('')===selected,'Rendered and saved poem differ');
  click('[data-panel="tasks"]');assert(document.querySelector('#poem-next').hidden,'Next control visible outside poem');
  click('[data-panel="today"]');assert(poem.textContent===selected,'Poem lost when switching tabs');
  const index=window.HamrahOverview.createPoemNavigator(360,localStorage).current();
  assert(index===saved.index,'Poem preference lost on controller restart');
  const baseline=counts(), prefix='آزمون باکس ';
  const wall=window.HamrahOffline.localDateInput(new Date());
  for(const category of ['personal','company','meeting']){
    click('[data-open-form]');document.querySelector('#task-title').value=prefix+category;
    document.querySelector('#task-category').value=category;
    const date=document.querySelector('#task-date-control input'),time=document.querySelector('#task-time-control input');
    date.value=window.HamrahInputs.dateInputValue(wall.split('T')[0]);date.dispatchEvent(new Event('input',{bubbles:true}));
    time.value=wall.split('T')[1];time.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#task-form').requestSubmit();
    await wait(()=>!document.querySelector('#task-modal').classList.contains('open'));
  }
  const totals=counts();assert(totals.every((v,i)=>v===baseline[i]+(i===0?3:1)),'Created records are not reflected in scoped counts');
  click('[data-filter="company"]');const business=counts();assert(business[0]===business[2]&&business[1]===0&&business[3]===0,'Filtered counters do not match list');
  click('[data-filter="all"]');
  const find=category=>[...document.querySelectorAll('#task-list .item')].find(el=>el.textContent.includes(prefix+category));
  const completedId=find('meeting').dataset.id;
  const complete=find('meeting').querySelector('[data-action="toggle"]');complete.click();complete.click();
  await wait(()=>!find('meeting'));
  assert(JSON.parse(localStorage.getItem('hamrah-local-v2')).find(t=>t.id===completedId)?.done,'Completion was not persisted after rapid clicks');
  assert(counts()[0]===totals[0]-1&&counts()[3]===totals[3]-1,'Completed meeting still in remaining counters');
  const doneAfter=Number(document.querySelector('.overview-meeting small').textContent.replace(/[۰-۹]/g,n=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(n)).match(/\d+/)[0]);
  assert(doneAfter===doneBefore+1,'Completed meeting count missing');
  click('[data-panel="tasks"]');assert(!find('meeting'),'Completed meeting reappeared in Tasks');
  click('[data-panel="calendar"]');assert(!document.querySelector(`#dated-list [data-id="${completedId}"]`),'Completed meeting remains in calendar');
  click('[data-panel="today"]');
  const beforeEdit=counts();find('personal').querySelector('[data-action="edit"]').click();
  document.querySelector('#task-category').value='company';document.querySelector('#task-form').requestSubmit();
  await wait(()=>counts()[1]===beforeEdit[1]-1);assert(counts()[2]===beforeEdit[2]+1,'Editing category did not recount');
  for(const category of ['personal','company']){
    find(category).querySelector('[data-action="delete"]').click();
    document.querySelector('[data-action="confirm-delete"]').click();await wait(()=>!find(category));
  }
  assert(counts().every((v,i)=>v===baseline[i]),'Deleting synthetic records did not restore counts');
  assert(JSON.parse(localStorage.getItem('hamrah-local-v2')).some(t=>t.id===completedId&&t.done),'Completed history was deleted');
  return {fourCards:true,todayScope:true,filteredScope:true,createEditCompleteDelete:true,completedCountsOnly:true,rapidCompletion:true,completedId,nextPoem:true,sameDayPersistence:true};
}
