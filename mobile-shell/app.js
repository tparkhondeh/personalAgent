(() => {
  "use strict";
  const storageKey = "hamrah-local-v2";
  const channelId = "urgent-overdue";
  const labels = { category: { personal: "شخصی", company: "شرکتی", meeting: "جلسه" }, priority: { normal: "عادی", important: "مهم", urgent: "فوری" } };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const list = $("#task-list");
  const datedList = $("#dated-list");
  const form = $("#task-form");
  const modal = $("#task-modal");
  const alarmStatus = $("#alarm-status");
  const localNotifications = window.Capacitor?.Plugins?.LocalNotifications;
  const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", hourCycle:"h23",calendar:"persian" });
  const domain = window.HamrahOffline;
  const overview = window.HamrahOverview;
  overview.observePoemLayout($("#page-title"));
  const poemNavigator = overview.createPoemNavigator(window.HamrahPoems.length, { getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value) });
  const preferenceKey = "hamrah-local-reminders-v1";
  let filter = "all";
  let panel = "today";
  let pendingDelete = "";
  let tasks = loadTasks();
  let reminderOffsets;
  try { reminderOffsets = domain.normalizeOffsets(JSON.parse(localStorage.getItem(preferenceKey) || "null")); }
  catch { reminderOffsets = domain.normalizeOffsets(null); }
  const offsetLabels = { 1440: "۱ روز قبل", 180: "۳ ساعت قبل", 60: "۱ ساعت قبل" };

  function loadTasks() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
  function saveTasks() { localStorage.setItem(storageKey, JSON.stringify(tasks)); }
  function notificationId() { return (crypto.getRandomValues(new Uint32Array(1))[0] % 2000000000) + 1; }
  function toFa(value) { return Number(value).toLocaleString("fa-IR"); }
  function escapeText(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }

  function openForm(task) {
    cancelVoice();
    form.reset();
    $("#task-id").value = task?.id || "";
    $("#task-title").value = task?.title || "";
    $("#task-category").value = task?.category || "personal";
    $("#task-priority").value = task?.priority || "normal";
    $("#task-deadline").value = task?.deadline ? domain.localDateInput(task.deadline) : "";
    let [formDate,formTime]=($("#task-deadline").value||"T").split("T");
    const updateDeadline=()=>{$("#task-deadline").value=formDate||formTime?`${formDate}T${formTime}`:"";};
    window.HamrahControls.date($("#task-date-control"),formDate,v=>{formDate=v;updateDeadline();});
    window.HamrahControls.time($("#task-time-control"),formTime,v=>{formTime=v;updateDeadline();});
    $("#form-reminders").textContent = `یادآوری‌ها: ${domain.normalizeOffsets(task?.reminderOffsets || reminderOffsets).map((offset) => offsetLabels[offset]).join("، ")}`;
    $("#form-title").textContent = task ? "ویرایش برنامه" : "برنامه جدید";
    modal.classList.add("open");
    setTimeout(() => $("#task-title").focus(), 80);
  }
  function closeForm() { modal.classList.remove("open"); }

  async function ensureNotificationAccess(openSettings = false) {
    if (!localNotifications) { alarmStatus.textContent = "اعلان بومی در این محیط در دسترس نیست."; return false; }
    let permission = await localNotifications.checkPermissions();
    if (permission.display !== "granted") permission = await localNotifications.requestPermissions();
    if (permission.display !== "granted") { alarmStatus.textContent = "اجازه اعلان داده نشد؛ از تنظیمات گوشی آن را فعال کنید."; return false; }
    await localNotifications.createChannel({ id: channelId, name: "کارهای فوری عقب‌افتاده", description: "هشدار کارهای فوری tia", sound: "urgent_alarm.wav", importance: 5, visibility: 1, lights: true, lightColor: "#5C70B4", vibration: true });
    if (openSettings && localNotifications.checkExactNotificationSetting) {
      const exact = await localNotifications.checkExactNotificationSetting();
      if (exact.exact_alarm !== "granted" && localNotifications.changeExactNotificationSetting) await localNotifications.changeExactNotificationSetting();
    }
    alarmStatus.textContent = "اعلان‌ها فعال هستند.";
    return true;
  }
  async function scheduleNotification(task, kind = "task") {
    if (task.archived || (kind !== "test" && task.approvedPlan && !task.approvedPlan.channels.some(c=>c==="ALARM"||c==="NATIVE"))) return false;
    if (!task.deadline || task.done || !(await ensureNotificationAccess(false))) return false;
    const alarm=kind==="test" || !task.approvedPlan || task.approvedPlan.channels.includes("ALARM");
    const selectedChannel=alarm?channelId:"approved-local-notifications";
    if(!alarm)await localNotifications.createChannel({id:selectedChannel,name:"اعلان برنامه",importance:3,vibration:true});
    const times = kind === "test" ? [new Date(task.deadline).getTime()] : task.approvedPlan ? planner.plannedReminderTimes({...task.approvedPlan,operation:"CREATE",recurrence:"NONE",occurrenceCount:null,...planner.dateParts(new Date(task.deadline),task.approvedPlan.timezone)}).map(r=>Date.parse(r.scheduledFor)) : domain.reminderTimes(task);
    if(kind!=="test" && task.approvedPlan?.escalation && task.priority==="urgent" && task.approvedPlan.channels.includes("ALARM")){
      for(let n=1;n<=task.approvedPlan.repeatCount;n++){
        const base=new Date(Date.parse(task.deadline)+n*task.approvedPlan.repeatMinutes*60000);
        const extra=planner.plannedReminderTimes({...task.approvedPlan,operation:"CREATE",recurrence:"NONE",occurrenceCount:null,reminderOffsets:[0],...planner.dateParts(base,task.approvedPlan.timezone)});
        if(extra[0])times.push(Date.parse(extra[0].scheduledFor));
      }
    }
    if (!times.length) return false;
    const usedIds = new Set(tasks.flatMap(domain.notificationIds));
    task.notificationIds = times.map(() => { let id; do { id = notificationId(); } while (usedIds.has(id)); usedIds.add(id); return id; });
    // Persist IDs before scheduling so completion/retry can cancel a partial native delivery.
    if (kind !== "test") saveTasks();
    await localNotifications.schedule({ notifications: times.map((time, index) => ({ id: task.notificationIds[index], title: kind === "test" ? "آزمایش هشدار tia" : "یادآوری برنامه", body: task.title, largeBody: task.title, channelId:selectedChannel, ...(alarm?{sound:"urgent_alarm.wav"}:{}), smallIcon: "ic_stat_hamrah", iconColor: "#5C70B4", autoCancel: true, schedule: { at: new Date(time), allowWhileIdle: alarm }, extra: { owner: "hamrah-local", kind } })) });
    return true;
  }
  async function cancelNotifications(task) {
    const ids = domain.notificationIds(task);
    if (localNotifications && ids.length) await localNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  }

  function taskMarkup(task) {
    const deadline = task.deadline ? `<span class="tag">${escapeText(dateTime.format(new Date(task.deadline)))}</span>` : "";
    const actions = pendingDelete === task.id ? '<button class="text-button danger" data-action="confirm-delete" type="button">تأیید حذف</button><button class="text-button" data-action="cancel-delete" type="button">انصراف</button>' : '<button class="text-button" data-action="edit" type="button">ویرایش</button><button class="text-button danger" data-action="delete" type="button">حذف</button>';
    return `<article class="item${task.done ? " done" : ""}" data-id="${escapeText(task.id)}"><button class="check" data-action="toggle" type="button" aria-label="${task.done ? "بازگرداندن برنامه" : "انجام شد"}">${task.done ? "✓" : ""}</button><div><h3>${escapeText(task.title)}</h3><div class="meta"><span class="tag">${labels.category[task.category] || "شخصی"}</span><span class="tag ${escapeText(task.priority)}">${labels.priority[task.priority] || "عادی"}</span>${deadline}</div></div><div class="item-actions">${actions}</div></article>`;
  }
  function render() {
    const visible = overview.selectDashboardItems(tasks, panel, filter);
    list.innerHTML = visible.length ? visible.map(taskMarkup).join("") : '<span class="sr-only">برنامه‌ای در این فهرست نیست.</span>';
    $("#dashboard-overview").setAttribute("aria-label", panel === "today" ? "آمار برنامه‌های امروز، همه وضعیت‌ها" : "آمار فهرست فعلی، همه وضعیت‌ها");
    $("#dashboard-overview").innerHTML = overview.summarizeDashboardItems(visible).map(group=>`<article class="overview-card overview-${group.key}" aria-label="${group.name}"><span dir="ltr">${group.label}</span><strong>${toFa(group.total)}</strong><small>${toFa(group.done)} انجام‌شده</small></article>`).join("");
    const dated = tasks.filter((task) => task.deadline && !task.archived).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    datedList.innerHTML = dated.length ? dated.map(taskMarkup).join("") : '<div class="empty">برنامه زمان‌داری وجود ندارد.</div>';
    renderCalendar();
    requestAnimationFrame(()=>window.HamrahCapture.fitProgramList(list,panel==="today"));
  }
  function renderCalendar() {
    const now = new Date();
    const { first, days } = domain.persianMonth(now);
    $("#calendar-month").textContent = new Intl.DateTimeFormat("fa-IR", { month: "long", year: "numeric" }).format(now);
    const cells = ["ش", "ی", "د", "س", "چ", "پ", "ج"].map((name) => `<div class="day-name">${name}</div>`);
    for (let index = 0; index < (first.getDay() + 1) % 7; index += 1) cells.push("<div></div>");
    for (const { day, date } of days) {
      const key = domain.localDateInput(date).slice(0, 10);
      const hasTask = tasks.some((task) => !task.archived && task.deadline && domain.localDateInput(task.deadline).slice(0, 10) === key);
      cells.push(`<div class="day${key === domain.localDateInput(now).slice(0, 10) ? " today" : ""}${hasTask ? " has-task" : ""}">${toFa(day)}</div>`);
    }
    $("#calendar-grid").innerHTML = cells.join("");
  }
  function showPanel(name) {
    if(panel==="assistant"&&name!==panel)cancelVoice();
    panel = name;
    document.querySelector(".app").dataset.panel=name;
    $("#program-list-title").textContent=name==="tasks"?"فهرست برنامه‌ها":"برنامه امروز";
    const target = name === "tasks" ? "today" : name;
    $$(".panel").forEach((item) => item.classList.toggle("active", item.id === `${target}-panel`));
    $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.panel === name));
    renderHeader(); render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (!title) return;
    const existing = tasks.find((task) => task.id === data.get("id"));
    const deadlineValue = String(data.get("deadline") || "");
    if(deadlineValue && (!window.HamrahInputs.persianParts(deadlineValue.split("T")[0])||!window.HamrahInputs.validTime24(deadlineValue.split("T")[1]||""))){$("#form-reminders").textContent="تاریخ شمسی و ساعت ۲۴ساعته معتبر وارد کن.";return;}
    if (existing) { try { await cancelNotifications(existing); } catch { $("#form-reminders").textContent = "لغو یادآوری قبلی کامل نشد؛ دوباره تلاش کن."; return; } }
    const task = { ...existing, id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title, category: String(data.get("category") || "personal"), priority: String(data.get("priority") || "normal"), deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null, reminderOffsets: existing?.approvedPlan ? existing.approvedPlan.reminderOffsets : domain.normalizeOffsets(existing?.reminderOffsets || reminderOffsets), notificationIds: [], done: existing?.done || false, updatedAt:new Date().toISOString() };
    if(task.approvedPlan){task.approvedPlan={...task.approvedPlan,quietStart:"00:00",quietEnd:"00:00"};}
    if(task.approvedPlan?.durationMinutes && task.deadline)task.endsAt=new Date(Date.parse(task.deadline)+task.approvedPlan.durationMinutes*60000).toISOString();
    tasks = existing ? tasks.map((item) => item.id === task.id ? task : item) : [task, ...tasks];
    saveTasks(); render(); closeForm();
    $("#page-status").textContent = "برنامه ذخیره شد.";
    if (task.deadline && !task.done) {
      try { const scheduled = await scheduleNotification(task); $("#page-status").textContent = scheduled ? "برنامه ذخیره و یادآوری‌ها تنظیم شدند." : "برنامه ذخیره شد؛ یادآوری به زمان آینده و اجازه اعلان نیاز دارد."; }
      catch { $("#page-status").textContent = "برنامه ذخیره شد، اما تنظیم یادآوری کامل نشد؛ از تنظیمات دوباره تلاش کن."; }
    }
  });
  async function handleListAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.closest("[data-id]")?.dataset.id;
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    if (button.dataset.action === "edit") { openForm(task); return; }
    if (button.dataset.action === "delete") { pendingDelete = id; render(); return; }
    if (button.dataset.action === "cancel-delete") { pendingDelete = ""; render(); return; }
    try {
      if (button.dataset.action === "toggle") { await cancelNotifications(task); task.done = !task.done; task.updatedAt=new Date().toISOString(); saveTasks(); if (!task.done) await scheduleNotification(task); }
      if (button.dataset.action === "confirm-delete") { await cancelNotifications(task); tasks = tasks.filter((item) => item.id !== id); pendingDelete = ""; }
    } catch { $("#page-status").textContent = "تنظیم یادآوری کامل نشد؛ دوباره تلاش کن."; render(); return; }
    saveTasks(); render();
  }
  list.addEventListener("click", handleListAction);
  datedList.addEventListener("click", handleListAction);
  $$(`[data-open-form]`).forEach((button) => button.addEventListener("click", () => openForm()));
  $("#close-form").addEventListener("click", closeForm);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeForm(); });
  $$(`[data-filter]`).forEach((button) => button.addEventListener("click", () => { filter = button.dataset.filter; $$(`[data-filter]`).forEach((item) => item.classList.toggle("active", item === button)); render(); }));
  $$(`[data-panel]`).forEach((button) => button.addEventListener("click", () => showPanel(button.dataset.panel, button)));
  let agentDraft = null, agentBusy = false;
  const planner = window.HamrahPlanner;
  const draftKey = "hamrah-confirmed-local-draft-v1";
  function planningItems() { return tasks.filter(t=>!t.done && !t.archived).map(t=>({id:t.id,title:t.title,entity:t.category==="meeting"?"MEETING":"TASK",category:t.category==="company"?"WORK":"PERSONAL",priority:t.priority.toUpperCase(),alertPolicy:t.approvedPlan?JSON.stringify(t.approvedPlan):null,dueAt:t.deadline,startsAt:t.category==="meeting"?t.deadline:null,endsAt:t.endsAt,updatedAt:t.updatedAt||t.id})); }
  function showAgentDraft(extraMessage = "") {
    const root=$("#assistant-result"); root.hidden=false;
    const detailsWereOpen=Boolean(root.querySelector('.approval-details')?.open);
    if(!agentDraft){root.textContent=extraMessage;return;}
    const p=planner.normalizePlanForReview(agentDraft.plan,planningItems()), check=planner.inspectPlan(p,new Date(),planningItems());
    check.questions.push(...(agentDraft.questions||[]));
    const fields=[
      ["عنوان","title","text",p.title],
      ...(p.recurrence!=="NONE"?[["تعداد نوبت تکرار، ۲ تا ۱۲","occurrenceCount","number",p.occurrenceCount??""]]:[]),
      ...(p.escalation?[["تعداد هشدار پس از موعد","repeatCount","number",p.repeatCount],["فاصله پیگیری هشدار (دقیقه)","repeatMinutes","number",p.repeatMinutes]]:[]),

    ];
    const choices=(key,values)=>'<label>'+({category:"دسته",priority:"اولویت",recurrence:"تکرار برنامه"}[key])+'<select data-plan="'+key+'">'+Object.entries(values).map(([v,label])=>'<option value="'+v+'"'+(p[key]===v?' selected':'')+'>'+label+'</option>').join("")+'</select></label>';
    root.innerHTML='<h3>پیش‌نمایش تأیید — نسخه '+toFa(agentDraft.revision)+'</h3><p>پردازش محلی؛ بدون ارسال اطلاعات. </p><p>'+escapeText(extraMessage)+'</p><div class="form-grid">'+fields.map(([label,key,type,value])=>'<label class="field">'+label+'<input data-plan="'+key+'" type="'+type+'" value="'+escapeText(String(value))+'"/></label>').join("")+choices("priority",{NORMAL:"عادی",IMPORTANT:"مهم",URGENT:"فوری"})+choices("recurrence",{NONE:"ندارد",DAILY:"روزانه",WEEKLY:"هفتگی"})+'</div><div class="reminder-options">'+[1440,180,60].map(m=>'<label><input type="checkbox" data-offset="'+m+'" '+(p.reminderOffsets.includes(m)?"checked":"")+'>'+offsetLabels[m]+'</label>').join("")+'</div><div class="reminder-options">'+Object.entries({IN_APP:"داخل برنامه",PUSH:"Push؛ نیازمند اتصال",NATIVE:"Notification",ALARM:"Alarm گوشی"}).map(([v,label])=>'<label><input type="checkbox" data-channel="'+v+'" '+(p.channels.includes(v)?"checked":"")+'>'+label+'</label>').join("")+'</div><label><input type="checkbox" id="local-escalation" '+(p.escalation?"checked":"")+'>تشدید هشدار فوری پس از موعد</label><p>'+p.defaults.map(escapeText).join("؛ ")+'</p>'+[...check.questions,...check.warnings].map(t=>'<p>'+escapeText(t)+'</p>').join("")+'<p>تبدیل صوت آفلاین در دسترس نیست. برای وویس از نسخه متصل استفاده کن. تماس و پیامک واقعی غیرفعال‌اند.</p><div class="settings-actions"><button id="local-plan-confirm" class="primary" '+''+'>ثبت</button><button id="local-plan-cancel" class="secondary">انصراف</button></div><p id="local-plan-status" role="status"></p>';
    const grid=root.querySelector(".form-grid");
    const operation=document.createElement("p");operation.textContent=({CREATE:"ثبت مورد جدید",UPDATE:"ویرایش مورد انتخاب‌شده",COMPLETE:"تکمیل مورد انتخاب‌شده",DELETE:"حذف و بایگانی مورد انتخاب‌شده"})[p.operation];grid.before(operation);
    const changed=()=>{agentDraft.revision++;agentDraft.questions=[];localStorage.setItem(draftKey,JSON.stringify(agentDraft));showAgentDraft("جزئیات تغییر کرد؛ نسخه تازه را بررسی و ثبت کن.");};
    const categoryLabel=document.createElement("label");categoryLabel.textContent="دسته‌بندی";const categorySelect=document.createElement("select");
    for(const [v,label] of Object.entries({PERSONAL:"شخصی",WORK:"شرکتی",MEETING:"جلسه"})){if(p.operation!=="CREATE"&&((p.entity==="MEETING")!==(v==="MEETING")))continue;categorySelect.add(new Option(label,v));}
    categorySelect.value=p.entity==="MEETING"?"MEETING":p.category;categorySelect.onchange=()=>{p.entity=categorySelect.value==="MEETING"?"MEETING":"TASK";if(p.entity==="TASK")p.category=categorySelect.value;changed();};categoryLabel.append(categorySelect);grid.append(categoryLabel);
    for(const [key,label] of [["date","تاریخ شمسی"],["time","ساعت ۲۴ساعته"]]){const wrapper=document.createElement("label");wrapper.textContent=label;const control=document.createElement("span");wrapper.append(control);grid.append(wrapper);window.HamrahControls[key](control,p[key],v=>{p[key]=v;if(key==="time")p.ambiguousTime=null;changed();});}
    const actions=root.querySelector(".settings-actions"), editButton=document.createElement("button");
    editButton.className="secondary";editButton.textContent="ویرایش";editButton.onclick=()=>{root.querySelector('.approval-details').open=true;root.scrollIntoView({block:'start'});root.querySelector('[data-plan="title"]').focus();resizeApproval();};actions.insertBefore(editButton,$("#local-plan-cancel"));
    const timeline=document.createElement("ul"), localTime=new Intl.DateTimeFormat("fa-IR",{timeZone:p.timezone,dateStyle:"medium",timeStyle:"short",hourCycle:"h23",calendar:"persian"});
    for(const entry of planner.plannedReminderTimes(p)){const line=document.createElement("li");line.textContent=entry.offset+" دقیقه قبل: "+localTime.format(new Date(entry.scheduledFor));timeline.appendChild(line);}actions.before(timeline);
    if(p.channels.some(c=>c==="PUSH"||c==="IN_APP")){const note=document.createElement("p");note.textContent="Push و مرکز اعلان حساب در حالت محلی فعال نیستند؛ Notification و Alarm به اجازه دستگاه نیاز دارند.";actions.before(note);}
    // Keep confirmation beside the complete summary; only the editor scrolls.
    const details=document.createElement('details');details.className='approval-details';details.open=detailsWereOpen;
    const more=document.createElement('summary');more.textContent='جزئیات بیشتر';details.append(more);
    const editor=document.createElement('div');editor.className='approval-editor';details.append(editor);
    const statusNode=$('#local-plan-status');
    for(const node of [...root.childNodes])if(node!==actions&&node!==statusNode)editor.append(node);
    root.classList.add('compact-review');actions.classList.add('approval-actions');
    const summary=planner.approvalSummary(p), compact=document.createElement('div');compact.className='approval-summary';compact.setAttribute('aria-label','خلاصه پیشنهاد');
    const operationTitle=document.createElement('h3');operationTitle.textContent=({CREATE:'بررسی پیش از ایجاد',UPDATE:'بررسی پیش از ویرایش',COMPLETE:'بررسی پیش از تکمیل',DELETE:'بررسی پیش از حذف و بایگانی'})[p.operation];
    compact.innerHTML='<h3>'+escapeText(p.title||'عنوان تعیین نشده')+'</h3><p>'+escapeText(summary.category+' · '+summary.priority+' · '+summary.when)+'</p><p>یادآوری: '+escapeText(summary.reminders)+'</p><p>هشدار: '+escapeText(summary.channels)+'</p>'+(summary.recurrence?'<p>تکرار برنامه: '+escapeText(summary.recurrence)+'</p>':'')+(summary.followUp?'<p>'+escapeText(summary.followUp)+'</p>':'');
    for(const warning of [...check.warnings,...(p.channels.some(c=>c==='PUSH'||c==='IN_APP')?['Push و مرکز اعلان حساب در حالت محلی فعال نیستند.']:[]),...(p.operation==='DELETE'?['این تأیید، مورد انتخاب‌شده را حذف و هشدارهای آن را لغو می‌کند.']:[])]){const note=document.createElement('p');note.className='approval-warning';note.textContent=warning;compact.append(note);}
    for(const m of p.reminderOffsets.filter(m=>![1440,180,60].includes(m))){const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.dataset.offset=String(m);label.append(checkbox,document.createTextNode(toFa(m)+' دقیقه قبل'));editor.append(label);}
    root.replaceChildren(operationTitle,compact,actions,details,statusNode);
    details.addEventListener('toggle',resizeApproval);resizeApproval();
    root.querySelectorAll("[data-plan],[data-offset],[data-channel],#local-escalation").forEach(input=>input.addEventListener("change",()=>{
      if(input.dataset.plan) {const key=input.dataset.plan;p[key]=["durationMinutes","occurrenceCount","repeatCount","repeatMinutes"].includes(key)?(input.value?Number(input.value):null):input.value;}
      if(input.dataset.offset){const m=Number(input.dataset.offset);p.reminderOffsets=input.checked?[...new Set([...p.reminderOffsets,m])].sort((a,b)=>b-a):p.reminderOffsets.filter(v=>v!==m);}
      if(input.dataset.channel){const c=input.dataset.channel;p.channels=input.checked?[...new Set([...p.channels,c])]:p.channels.filter(v=>v!==c);}
      if(input.id==="local-escalation")p.escalation=input.checked;
      agentDraft.revision++;agentDraft.questions=[]; localStorage.setItem(draftKey,JSON.stringify(agentDraft));showAgentDraft("جزئیات تغییر کرد؛ نسخه تازه را بررسی و تأیید کن.");
    }));
    $("#local-plan-cancel").onclick=()=>{agentDraft.status="CANCELLED";localStorage.setItem(draftKey,JSON.stringify(agentDraft));agentDraft=null;showAgentDraft("لغو شد؛ چیزی ثبت یا زمان‌بندی نشد.");};
    $("#local-plan-confirm").onclick=async()=>{
      if(agentBusy)return;agentBusy=true;$("#local-plan-confirm").disabled=true;
      try{
        const stored=JSON.parse(localStorage.getItem(draftKey)||"null");
        if(!stored||stored.id!==agentDraft.id||stored.revision!==agentDraft.revision||stored.status!=="PENDING")throw new Error("نسخه پیشنهاد تغییر کرده است.");
        const errors=[...planner.inspectPlan(p,new Date(),planningItems()).questions,...(agentDraft.questions||[])];
        if(errors.length){
          details.open=true;
          root.querySelectorAll("[data-approval-error]").forEach(e=>e.remove());
          for(const [selector,pattern] of [['[data-plan="title"]',/عنوان/],['input[aria-label="تاریخ شمسی"]',/تاریخ|روز/],['input[aria-label="ساعت ۲۴ساعته"]',/ساعت|زمان/],['[data-plan="repeatCount"]',/تعداد هشدار/],['[data-plan="repeatMinutes"]',/فاصله هشدار/],['[data-plan="occurrenceCount"]',/نوبت/]]){
            const message=errors.find(e=>pattern.test(e)),field=root.querySelector(selector);
            if(message&&field){field.setAttribute("aria-invalid","true");const hint=document.createElement("small");hint.dataset.approvalError="true";hint.className="field-error";hint.textContent=message;field.closest("label").append(hint);}
          }
          throw new Error(errors[0]);
        }
        const existing=p.targetId?tasks.find(t=>t.id===p.targetId):null;
        if(p.operation!=="CREATE" && (!existing||(existing.updatedAt||existing.id)!==p.targetUpdatedAt))throw new Error("مورد انتخاب‌شده تغییر کرده؛ دوباره درخواست بده.");
        // Claim before any await; repeated clicks/reloads cannot create another entity.
        agentDraft.status="EXECUTING";localStorage.setItem(draftKey,JSON.stringify(agentDraft));
        if(existing)await cancelNotifications(existing);
        const instant=planner.planInstant(p.date,p.time,p.timezone);
        const task={...existing,id:existing?.id||agentDraft.id,title:p.title,category:p.entity==="MEETING"?"meeting":p.category==="WORK"?"company":"personal",priority:p.priority.toLowerCase(),deadline:instant?.toISOString()??null,endsAt:instant&&p.durationMinutes?new Date(instant.getTime()+p.durationMinutes*60000).toISOString():null,reminderOffsets:p.reminderOffsets,notificationIds:[],done:p.operation==="COMPLETE",archived:p.operation==="DELETE",updatedAt:new Date().toISOString(),approvedPlan:p};
        const series=p.operation==="CREATE"&&p.recurrence!=="NONE"?planner.planOccurrences(p).map((o,i)=>({...task,id:i?task.id+"-"+i:task.id,deadline:o.instant,notificationIds:[],endsAt:o.instant&&p.durationMinutes?new Date(Date.parse(o.instant)+p.durationMinutes*60000).toISOString():null})):[task];
        tasks=existing?tasks.map(t=>t.id===task.id?task:t):[...series,...tasks];saveTasks();
        agentDraft.status="EXECUTED";localStorage.setItem(draftKey,JSON.stringify(agentDraft));agentDraft=null;
        let result="ثبت محلی انجام شد؛ هنوز با حساب سرور همگام نشده است.";
        if(p.channels.includes("PUSH"))result+=" Push در حالت آفلاین ارسال نمی‌شود.";
        if(p.operation==="CREATE"||p.operation==="UPDATE"){
          try{if(p.channels.some(c=>c==="ALARM"||c==="NATIVE")){let scheduled=0;for(const item of series){if(await scheduleNotification(item))scheduled++;}result+=scheduled===series.length?" Notification تنظیم شد.":" برخی اعلان‌ها تنظیم نشدند؛ زمان آینده و اجازه گوشی لازم است.";}}catch{result+=" ثبت انجام شد، اما Notification کامل تنظیم نشد.";}
        }
        showAgentDraft(result);render();
      }catch(error){$("#local-plan-status").textContent=error.message||"ثبت انجام نشد؛ دوباره بررسی کن.";}finally{agentBusy=false;if($("#local-plan-confirm"))$("#local-plan-confirm").disabled=false;}
    };
  }
  function replyToMessage() {
    const message=$("#assistant-input").value.trim();if(!message||agentBusy)return;
    const result=planner.planPersian(message,{timezone:"Asia/Tehran",previous:agentDraft?.status==="PENDING"?agentDraft.plan:null,items:planningItems(),offsets:reminderOffsets});
    if(!result.plan){agentDraft=null;showAgentDraft(result.reply);return;}
    agentDraft={id:agentDraft?.status==="PENDING"?agentDraft.id:crypto.randomUUID(),revision:(agentDraft?.revision||0)+1,status:"PENDING",plan:result.plan,questions:result.questions.filter(q=>/چند درخواست|تاریخ شمسی/.test(q))};
    localStorage.setItem(draftKey,JSON.stringify(agentDraft));$("#assistant-input").value="";saveInput();showAgentDraft(result.reply);
    $("#assistant-input").blur();requestAnimationFrame(()=>$("#assistant-result").scrollIntoView({block:"start"}));
  }
  function resizeApproval(){requestAnimationFrame(()=>{const root=$('#assistant-result'),v=window.visualViewport;root.style.setProperty('--review-viewport',`${v?.height||window.innerHeight}px`);const editor=root.querySelector('.approval-editor');if(root.querySelector('.approval-details')?.open){root.scrollIntoView({block:'start'});root.style.setProperty('--editor-available',`${Math.max(80,(v?.height||window.innerHeight)+(v?.offsetTop||0)-editor.getBoundingClientRect().top-96)}px`);}});}
  window.visualViewport?.addEventListener('resize',resizeApproval);
  const composeKey="hamrah-local-compose-v1";
  const input=$("#assistant-input");
  try{input.value=sessionStorage.getItem(composeKey)||"";}catch{}
  function saveInput(){try{sessionStorage.setItem(composeKey,input.value);}catch{} input.style.height="auto";input.style.height=Math.min(144,Math.max(44,input.scrollHeight))+"px";}
  input.addEventListener("input",saveInput);
  let voiceUrl="",voiceClip=null,voiceVersion=0,voiceBusy=false;
  const speech=window.HamrahCapture.createLocalSpeech();
  async function convertVoice(){
    if(!voiceClip||voiceBusy)return;
    const version=++voiceVersion;voiceBusy=true;$("#voice-retry").hidden=true;
    try{
      const text=await speech.transcribe(voiceClip,message=>{if(version===voiceVersion)$("#voice-status").textContent=message;});
      if(version!==voiceVersion)return;
      voiceCapture.cancel("");input.value=text;saveInput();replyToMessage();
      $("#voice-status").textContent="متن قابل‌ویرایش است؛ ثبت فقط با تأیید شما انجام می‌شود.";
    }catch(error){if(version===voiceVersion){voiceCapture.cancel("");$("#voice-status").textContent=error.message;$("#voice-retry").hidden=false;}}
    finally{if(version===voiceVersion)voiceBusy=false;}
  }
  function cancelVoice(){voiceVersion++;speech.cancel();voiceBusy=false;voiceCapture.cancel();$("#voice-retry").hidden=true;}
  const voiceCapture=window.HamrahCapture.createVoiceCapture((state,message)=>{
    const locked=state!=="idle";input.disabled=locked;$("#assistant-send").disabled=locked;$("#assistant-summary").disabled=locked;
    $("#voice-start").hidden=state!=="idle";$("#voice-stop").hidden=state!=="recording";$("#voice-cancel").hidden=state==="idle";
    $("#voice-status").textContent=message;$("#voice-retry").hidden=true;if(state==="ready")void convertVoice();
  },clip=>{voiceClip=clip;if(voiceUrl)URL.revokeObjectURL(voiceUrl);voiceUrl=clip?URL.createObjectURL(clip):"";if(clip)$("#voice-preview").src=voiceUrl;else{$("#voice-preview").removeAttribute("src");$("#voice-preview").load();}$("#voice-preview").hidden=!clip;});
  $("#voice-start").addEventListener("click",()=>void voiceCapture.start());
  $("#voice-stop").addEventListener("click",()=>voiceCapture.stop());
  $("#voice-cancel").addEventListener("click",cancelVoice);
  $("#voice-retry").addEventListener("click",()=>{if(voiceClip)void convertVoice();else void voiceCapture.start();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden)cancelVoice();});
  window.addEventListener("pagehide",()=>{cancelVoice();voiceCapture.dispose();},{once:true});
  window.addEventListener("resize",()=>{window.HamrahCapture.fitProgramList(list,panel==="today");saveInput();});
  $("#assistant-send").addEventListener("click", replyToMessage);
  $("#assistant-summary").addEventListener("click", () => { $("#assistant-input").value = "برنامه امروز من را خلاصه کن"; replyToMessage(); });

  $("#enable-notifications").addEventListener("click", async () => { try { if (await ensureNotificationAccess(true)) { for (const task of tasks.filter((item) => !item.done && item.deadline)) { await cancelNotifications(task); await scheduleNotification(task); } alarmStatus.textContent = "یادآوری‌های آینده دوباره تنظیم شدند."; } } catch { alarmStatus.textContent = "فعال‌سازی اعلان کامل نشد؛ دوباره تلاش کنید."; } });
  $("#test-alarm").addEventListener("click", async () => { try { const task = { title: "این هشدار برای کنترل عملکرد زنگ است.", deadline: new Date(Date.now() + 30000).toISOString(), notificationId: notificationId() }; const ok = await scheduleNotification(task, "test"); alarmStatus.textContent = ok ? "هشدار تنظیم شد و حدود ۳۰ ثانیه دیگر نمایش داده می‌شود." : "ابتدا اجازه اعلان را فعال کنید."; } catch { alarmStatus.textContent = "تنظیم هشدار آزمایشی ناموفق بود."; } });
  $$("input[name=reminder]").forEach((input) => { input.checked = reminderOffsets.includes(Number(input.value)); });
  $("#reminder-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = $$("input[name=reminder]:checked").map((input) => Number(input.value));
    if (!selected.length) { $("#reminder-status").textContent = "حداقل یک زمان را انتخاب کن."; return; }
    try { localStorage.setItem(preferenceKey, JSON.stringify(selected)); reminderOffsets = selected; $("#reminder-status").textContent = "تنظیمات برای برنامه‌های جدید ذخیره شد."; }
    catch { $("#reminder-status").textContent = "ذخیره تنظیمات انجام نشد؛ فضای دستگاه را بررسی کن."; }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeForm(); });
  function renderHeader() {
    const now = new Date();
    $("#today").textContent = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long" }).format(now);
    $("#gregorian-date").textContent = new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { timeZone: "Asia/Tehran", day: "numeric", month: "long", year: "numeric" }).format(now);
    const title = $("#page-title");
    title.classList.toggle("daily-poem", panel === "today");
    $("#poem-next").hidden = panel !== "today";
    if (panel === "today") { const lines = window.HamrahPoems[poemNavigator.current()]; title.setAttribute("aria-label", `شعر روز مولانا: ${lines.join("، ")}`); title.innerHTML = [0,2].map(i => `<span class="poem-couplet"><span>${escapeText(lines[i])}</span><span>${escapeText(lines[i+1])}</span></span>`).join(""); }
    else { title.removeAttribute("aria-label"); title.textContent = { tasks: "همه کارها و جلسات", calendar: "تقویم من", assistant: "", settings: "تنظیمات من", notifications: "اعلان‌ها" }[panel]; }
  }
  document.querySelectorAll('[data-appearance]').forEach(button=>button.addEventListener('click',()=>{
    const saved=window.HamrahAppearance?.set(button.dataset.appearance);
    $('#appearance-status').textContent=saved?'':'انتخاب فعلی اعمال شد؛ ذخیره روی این دستگاه ممکن نیست.';
  }));
  const updateAppearance=()=>document.querySelectorAll('[data-appearance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearance===window.HamrahAppearance?.get())));
  window.addEventListener('hamrah-appearance',updateAppearance);
  updateAppearance();
  renderHeader();
  $("#poem-next").addEventListener("click", () => { poemNavigator.next(); renderHeader(); });
  let renderedDay = overview.tehranDayKey();
  setInterval(() => { renderHeader(); const day=overview.tehranDayKey(); if(day!==renderedDay){renderedDay=day;render();} }, 30000);
  window.addEventListener("storage", renderHeader);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderHeader(); render(); } });
  render();
})();
