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
  const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });
  const domain = window.HamrahOffline;
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
    form.reset();
    $("#task-id").value = task?.id || "";
    $("#task-title").value = task?.title || "";
    $("#task-category").value = task?.category || "personal";
    $("#task-priority").value = task?.priority || "normal";
    $("#task-deadline").value = task?.deadline ? domain.localDateInput(task.deadline) : "";
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
    await localNotifications.createChannel({ id: channelId, name: "کارهای فوری عقب‌افتاده", description: "هشدار کارهای فوری همراه", sound: "urgent_alarm.wav", importance: 5, visibility: 1, lights: true, lightColor: "#5C70B4", vibration: true });
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
    await localNotifications.schedule({ notifications: times.map((time, index) => ({ id: task.notificationIds[index], title: kind === "test" ? "آزمایش هشدار همراه" : "یادآوری برنامه", body: task.title, largeBody: task.title, channelId:selectedChannel, ...(alarm?{sound:"urgent_alarm.wav"}:{}), smallIcon: "ic_stat_hamrah", iconColor: "#5C70B4", autoCancel: true, schedule: { at: new Date(time), allowWhileIdle: alarm }, extra: { owner: "hamrah-local", kind } })) });
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
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const scoped = (panel === "today" ? tasks.filter((task) => !task.done && (!task.deadline || new Date(task.deadline) <= endOfToday)) : tasks).filter(task=>!task.archived);
    const visible = filter === "all" ? scoped : scoped.filter((task) => task.category === filter);
    list.innerHTML = visible.length ? visible.map(taskMarkup).join("") : '<div class="empty"><strong>هنوز برنامه‌ای ثبت نشده</strong>با دکمه «برنامه جدید» اولین مورد را اضافه کنید.</div>';
    $("#all-count").textContent = toFa(tasks.filter(task=>!task.archived).length);
    $("#done-count").textContent = toFa(tasks.filter((task) => task.done).length);
    $("#urgent-count").textContent = toFa(tasks.filter((task) => task.priority === "urgent" && !task.done && !task.archived).length);
    const dated = tasks.filter((task) => task.deadline && !task.archived).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    datedList.innerHTML = dated.length ? dated.map(taskMarkup).join("") : '<div class="empty">برنامه زمان‌داری وجود ندارد.</div>';
    renderCalendar();
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
    panel = name;
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
    if (existing) { try { await cancelNotifications(existing); } catch { $("#form-reminders").textContent = "لغو یادآوری قبلی کامل نشد؛ دوباره تلاش کن."; return; } }
    const task = { ...existing, id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title, category: String(data.get("category") || "personal"), priority: String(data.get("priority") || "normal"), deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null, reminderOffsets: existing?.approvedPlan ? existing.approvedPlan.reminderOffsets : domain.normalizeOffsets(existing?.reminderOffsets || reminderOffsets), notificationIds: [], done: existing?.done || false, updatedAt:new Date().toISOString() };
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
    if(!agentDraft){root.textContent=extraMessage;return;}
    const p=agentDraft.plan, check=planner.inspectPlan(p,new Date(),planningItems());
    check.questions.push(...(agentDraft.questions||[]));
    const fields=[
      ["عنوان","title","text",p.title],["تاریخ میلادی","date","date",p.date],["ساعت ۲۴ساعته","time","time",p.time],
      ["مدت جلسه، دقیقه","durationMinutes","number",p.durationMinutes??""],["تعداد نوبت تکرار، ۲ تا ۱۲","occurrenceCount","number",p.occurrenceCount??""],
      ["تعداد هشدار","repeatCount","number",p.repeatCount],["فاصله هشدار، دقیقه","repeatMinutes","number",p.repeatMinutes],
      ["شروع سکوت","quietStart","time",p.quietStart],["پایان سکوت","quietEnd","time",p.quietEnd],
    ];
    const choices=(key,values)=>'<label>'+({category:"دسته",priority:"اولویت",operation:"عملیات",entity:"نوع",recurrence:"تکرار"}[key])+'<select data-plan="'+key+'">'+Object.entries(values).map(([v,label])=>'<option value="'+v+'"'+(p[key]===v?' selected':'')+'>'+label+'</option>').join("")+'</select></label>';
    root.innerHTML='<h3>پیش‌نمایش تأیید — نسخه '+toFa(agentDraft.revision)+'</h3><p>پردازش محلی؛ بدون ارسال اطلاعات. منطقه زمانی: '+escapeText(p.timezone)+'</p><p>'+escapeText(extraMessage)+'</p><div class="form-grid">'+fields.map(([label,key,type,value])=>'<label class="field">'+label+'<input data-plan="'+key+'" type="'+type+'" value="'+escapeText(String(value))+'"/></label>').join("")+choices("operation",{CREATE:"ایجاد",UPDATE:"ویرایش",COMPLETE:"تکمیل",DELETE:"حذف و بایگانی"})+choices("entity",{TASK:"کار",MEETING:"جلسه"})+choices("category",{PERSONAL:"شخصی",WORK:"شرکتی"})+choices("priority",{NORMAL:"عادی",IMPORTANT:"مهم",URGENT:"فوری"})+choices("recurrence",{NONE:"ندارد",DAILY:"روزانه",WEEKLY:"هفتگی"})+'</div><div class="reminder-options">'+[1440,180,60].map(m=>'<label><input type="checkbox" data-offset="'+m+'" '+(p.reminderOffsets.includes(m)?"checked":"")+'>'+offsetLabels[m]+'</label>').join("")+'</div><div class="reminder-options">'+Object.entries({IN_APP:"داخل برنامه",PUSH:"Push؛ نیازمند اتصال",NATIVE:"اعلان گوشی",ALARM:"Alarm گوشی"}).map(([v,label])=>'<label><input type="checkbox" data-channel="'+v+'" '+(p.channels.includes(v)?"checked":"")+'>'+label+'</label>').join("")+'</div><label><input type="checkbox" id="local-escalation" '+(p.escalation?"checked":"")+'>تشدید هشدار فوری</label><p>'+p.defaults.map(escapeText).join("؛ ")+'</p>'+[...check.questions,...check.warnings].map(t=>'<p>'+escapeText(t)+'</p>').join("")+'<p>تبدیل صوت آفلاین در دسترس نیست. برای وویس از نسخه متصل استفاده کن. تماس و پیامک واقعی غیرفعال‌اند.</p><div class="settings-actions"><button id="local-plan-confirm" class="primary" '+(check.questions.length?"disabled":"")+'>تأیید و اجرا</button><button id="local-plan-cancel" class="secondary">انصراف</button></div><p id="local-plan-status" role="status"></p>';
    const actions=root.querySelector(".settings-actions"), editButton=document.createElement("button");
    editButton.className="secondary";editButton.textContent="ویرایش";editButton.onclick=()=>root.querySelector('[data-plan="title"]').focus();actions.insertBefore(editButton,$("#local-plan-cancel"));
    const timeline=document.createElement("ul"), localTime=new Intl.DateTimeFormat("fa-IR",{timeZone:p.timezone,dateStyle:"medium",timeStyle:"short"});
    for(const entry of planner.plannedReminderTimes(p)){const line=document.createElement("li");line.textContent=entry.offset+" دقیقه قبل: "+localTime.format(new Date(entry.scheduledFor));timeline.appendChild(line);}actions.before(timeline);
    if(p.channels.some(c=>c==="PUSH"||c==="IN_APP")){const note=document.createElement("p");note.textContent="Push و مرکز اعلان حساب در حالت محلی فعال نیستند؛ اعلان گوشی و Alarm به اجازه دستگاه نیاز دارند.";actions.before(note);}
    root.querySelectorAll("[data-plan],[data-offset],[data-channel],#local-escalation").forEach(input=>input.addEventListener("change",()=>{
      if(input.dataset.plan) {const key=input.dataset.plan;p[key]=["durationMinutes","occurrenceCount","repeatCount","repeatMinutes"].includes(key)?(input.value?Number(input.value):null):input.value;}
      if(input.dataset.offset){const m=Number(input.dataset.offset);p.reminderOffsets=input.checked?[...new Set([...p.reminderOffsets,m])].sort((a,b)=>b-a):p.reminderOffsets.filter(v=>v!==m);}
      if(input.dataset.channel){const c=input.dataset.channel;p.channels=input.checked?[...new Set([...p.channels,c])]:p.channels.filter(v=>v!==c);}
      if(input.id==="local-escalation")p.escalation=input.checked;
      agentDraft.revision++;agentDraft.questions=[]; localStorage.setItem(draftKey,JSON.stringify(agentDraft));showAgentDraft("جزئیات تغییر کرد؛ نسخه تازه را بررسی و تأیید کن.");
    }));
    $("#local-plan-cancel").onclick=()=>{agentDraft.status="CANCELLED";localStorage.setItem(draftKey,JSON.stringify(agentDraft));agentDraft=null;showAgentDraft("لغو شد؛ چیزی ثبت یا زمان‌بندی نشد.");};
    $("#local-plan-confirm").onclick=async()=>{
      if(agentBusy)return;agentBusy=true;
      try{
        const stored=JSON.parse(localStorage.getItem(draftKey)||"null");
        if(!stored||stored.id!==agentDraft.id||stored.revision!==agentDraft.revision||stored.status!=="PENDING")throw new Error("نسخه پیشنهاد تغییر کرده است.");
        if(planner.inspectPlan(p,new Date(),planningItems()).questions.length || agentDraft.questions?.length)throw new Error("ابتدا اطلاعات نامشخص را تکمیل کن.");
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
          try{if(p.channels.some(c=>c==="ALARM"||c==="NATIVE")){let scheduled=0;for(const item of series){if(await scheduleNotification(item))scheduled++;}result+=scheduled===series.length?" اعلان گوشی تنظیم شد.":" برخی اعلان‌ها تنظیم نشدند؛ زمان آینده و اجازه گوشی لازم است.";}}catch{result+=" ثبت انجام شد، اما اعلان گوشی کامل تنظیم نشد.";}
        }
        showAgentDraft(result);render();
      }catch(error){$("#local-plan-status").textContent=error.message||"ثبت انجام نشد؛ دوباره بررسی کن.";}finally{agentBusy=false;}
    };
  }
  function replyToMessage() {
    const message=$("#assistant-input").value.trim();if(!message||agentBusy)return;
    const result=planner.planPersian(message,{timezone:"Asia/Tehran",previous:agentDraft?.status==="PENDING"?agentDraft.plan:null,items:planningItems(),offsets:reminderOffsets});
    if(!result.plan){agentDraft=null;showAgentDraft(result.reply);return;}
    agentDraft={id:agentDraft?.status==="PENDING"?agentDraft.id:crypto.randomUUID(),revision:(agentDraft?.revision||0)+1,status:"PENDING",plan:result.plan,questions:result.questions.filter(q=>/چند درخواست|تاریخ شمسی/.test(q))};
    localStorage.setItem(draftKey,JSON.stringify(agentDraft));$("#assistant-input").value="";showAgentDraft(result.reply);
  }
  $("#assistant-send").addEventListener("click", replyToMessage);
  $("#assistant-summary").addEventListener("click", () => { $("#assistant-input").value = "برنامه امروز من را خلاصه کن"; replyToMessage(); });
  $("#assistant-free-time").addEventListener("click", () => { $("#assistant-input").value = "برای زمان آزاد پیشنهاد بده"; replyToMessage(); });
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
    if (panel === "today") { const lines = domain.dailyPoem(window.HamrahPoems, now); title.setAttribute("aria-label", `شعر روز مولانا: ${lines.join("، ")}`); title.innerHTML = lines.map((line) => `<span>${escapeText(line)}</span>`).join(""); }
    else { title.removeAttribute("aria-label"); title.textContent = { tasks: "همه کارها و جلسات", calendar: "تقویم من", assistant: "گفتگو با همراه", settings: "تنظیمات من" }[panel]; }
  }
  renderHeader();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderHeader(); render(); } });
  render();
})();
