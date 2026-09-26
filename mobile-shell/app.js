(() => {
  "use strict";
  const taskStore = window.HamrahStorage.createTaskStore({
    getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
  });
  const storageWarning = document.createElement("p");
  storageWarning.setAttribute("role", "alert");
  storageWarning.className = "status";
  storageWarning.hidden = true;
  document.querySelector(".app").prepend(storageWarning);
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
  const alarmSounds = window.HamrahAlarmSounds;
  const disposeAlarmSettings = alarmSounds.mount($("#alarm-sound-setting"));
  window.addEventListener("pagehide", disposeAlarmSettings, { once: true });
  const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", hourCycle:"h23",calendar:"persian" });
  const domain = window.HamrahOffline;
  const overview = window.HamrahOverview;
  overview.observePoemLayout($("#page-title"));
  const poemNavigator = overview.createPoemNavigator(window.HamrahPoems.length, { getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value) });
  let personalPoem = null;
  const poemHost = document.createElement("span");
  $(".poem-row").append(poemHost);
  const preferenceKey = "hamrah-local-reminders-v1";
  let filter = "all";
  let panel = overview.initialDashboardView(window.location.search);
  let pendingDelete = "";
  const pendingActions = new Set();
  let tasks = loadTasks();
  let reminderOffsets;
  try { reminderOffsets = domain.normalizeOffsets(JSON.parse(localStorage.getItem(preferenceKey) || "null")); }
  catch { reminderOffsets = domain.normalizeOffsets(null); }
  const repeatSettingsStore = domain.createRepeatSettingsStore({ getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value) });
  const loadedRepeatSettings = repeatSettingsStore.load();
  let repeatSettings = loadedRepeatSettings.value;
  const offsetLabels = { 1440: "۱ روز قبل", 180: "۳ ساعت قبل", 60: "۱ ساعت قبل" };

  function storageFailure(reason) {
    storageWarning.hidden = false;
    storageWarning.textContent = reason === "changed"
      ? "اطلاعات در پنجره دیگری تغییر کرده؛ برای جلوگیری از بازنویسی، صفحه را دوباره باز کنید. چیزی ذخیره نشد."
      : "خواندن یا ذخیره اطلاعات گوشی ممکن نیست. اطلاعات قبلی پاک نشده؛ حافظه برنامه را پاک نکنید. تغییر جدید ذخیره نشده است.";
    if (modal.classList.contains("open")) $("#form-reminders").textContent = storageWarning.textContent;
  }
  function loadTasks() {
    const result = taskStore.load();
    if (!result.ok) storageFailure(result.reason);
    return result.tasks;
  }
  function saveTasks(next = tasks) {
    const result = taskStore.save(next);
    if (!result.ok) { tasks = taskStore.snapshot(); storageFailure(result.reason); return false; }
    tasks = next;
    storageWarning.hidden = true;
    return true;
  }
  function notificationId() { return (crypto.getRandomValues(new Uint32Array(1))[0] % 2000000000) + 1; }
  function toFa(value) { return Number(value).toLocaleString("fa-IR"); }
  function escapeText(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }

  function openForm(task) {
    cancelVoice();
    form.submitGeneration = (form.submitGeneration || 0) + 1;
    form.querySelector('[type="submit"]').disabled = false;
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
    updateManualRepeatDisclosure();
    modal.classList.add("open");
    setTimeout(() => $("#task-title").focus(), 80);
  }
  function closeForm() { modal.classList.remove("open"); }
  function updateManualRepeatDisclosure() {
    let note = $("#manual-repeat-disclosure");
    if (!note) { note = document.createElement("p"); note.id = "manual-repeat-disclosure"; note.className = "helper"; $("#form-reminders").after(note); }
    const existing = tasks.find(task => task.id === $("#task-id").value);
    const approved = existing?.approvedPlan;
    note.hidden = $("#task-priority").value !== "urgent";
    note.textContent = approved ? planner.approvalSummary(approved).followUp || "پیگیری پس از موعد در پیشنهاد قبلی فعال نشده است."
      : domain.repeatSummary(domain.manualRepeatPolicy(existing, repeatSettings));
    if (!note.hidden) note.textContent += " یادآوری‌های قبل از موعد محفوظ‌اند؛ اجرا به زمان آینده و اجازه گوشی نیاز دارد.";
  }
  $("#task-priority").addEventListener("change", updateManualRepeatDisclosure);

  async function ensureNotificationAccess(openSettings = false, requestPermission = true) {
    if (!localNotifications) { alarmStatus.textContent = "اعلان بومی در این محیط در دسترس نیست."; return false; }
    let permission = await localNotifications.checkPermissions();
    if (permission.display !== "granted" && requestPermission) permission = await localNotifications.requestPermissions();
    if (permission.display !== "granted") { alarmStatus.textContent = "اجازه اعلان داده نشد؛ از تنظیمات گوشی آن را فعال کنید."; return false; }
    if (openSettings && localNotifications.checkExactNotificationSetting) {
      const exact = await localNotifications.checkExactNotificationSetting();
      if (exact.exact_alarm !== "granted" && localNotifications.changeExactNotificationSetting) await localNotifications.changeExactNotificationSetting();
    }
    alarmStatus.textContent = "اعلان‌ها فعال هستند.";
    return true;
  }
  // Keep mapping persistence, native scheduling and per-task cancellation in one queue.
  let alarmWork = Promise.resolve();
  let alarmSyncNotice = "";
  const alarmVersion = task => JSON.stringify([task.updatedAt, task.deadline, task.title, task.done, task.archived, task.approvedPlan, task.notificationIds]);
  function enqueueAlarmWork(action) {
    const next = alarmWork.then(action); alarmWork = next.catch(() => {}); return next;
  }
  function cancellationReceipts(task) {
    const receipts = task.alarmCancellations === undefined ? [] : task.alarmCancellations;
    if (!Array.isArray(receipts) || receipts.some(receipt => !receipt ||
      !Number.isSafeInteger(receipt.id) || receipt.id < 1 || receipt.id > 2147483647 || receipt.taskId !== task.id)) {
      throw new Error("رسید لغو یادآوری معتبر نیست؛ اطلاعات قبلی حفظ شد.");
    }
    return receipts;
  }
  function reserveAlarmCancellations(previous, next) {
    if (!previous) return next;
    const receipts = new Map(cancellationReceipts(previous).map(receipt => [receipt.id, receipt]));
    const policy = task => JSON.stringify([task.deadline, task.priority, task.approvedPlan ? {
      channels: [...task.approvedPlan.channels].sort(), reminderOffsets: task.approvedPlan.reminderOffsets,
      escalation: task.approvedPlan.escalation, repeatCount: task.approvedPlan.repeatCount,
      repeatMinutes: task.approvedPlan.repeatMinutes, timezone: task.approvedPlan.timezone,
    } : { reminderOffsets: domain.normalizeOffsets(task.reminderOffsets), urgentRepeatPolicy: domain.manualRepeatPolicy(task) }]);
    if (!next.done && !next.archived && policy(previous) === policy(next)) {
      // Title-only/no-op edits retain exact IDs/times/sounds, including elapsed
      // entries and legacy mappings. New preferences never re-arm old alarms.
      return { ...next, notificationIds: previous.notificationIds, notificationId: previous.notificationId,
        notificationSchedule: previous.notificationSchedule, alarmCancellations: [...receipts.values()] };
    }
    for (const id of domain.notificationIds(previous)) receipts.set(id, { id, taskId: previous.id });
    // This field is committed in the SAME task-store write as the edit/completion.
    return { ...next, alarmCancellations: [...receipts.values()] };
  }
  async function drainAlarmCancellations() {
    for (const snapshot of tasks) {
      const receipts = cancellationReceipts(snapshot);
      if (!receipts.length) continue;
      if (!localNotifications) throw new Error("ارتباط با زنگ گوشی برای تکمیل لغو لازم است.");
      const matches = item => item.extra?.owner === "hamrah-local" &&
        receipts.some(receipt => item.id === receipt.id && item.extra?.taskId === receipt.taskId);
      const pending = (await localNotifications.getPending()).notifications;
      if (pending.some(item => item.extra?.owner === "hamrah-local" && !item.extra?.taskId && receipts.some(receipt => receipt.id === item.id))) {
        throw new Error("مالک یادآوری قدیمی احراز نشد؛ رسید لغو حفظ شد.");
      }
      const owned = pending.filter(matches);
      if (owned.length) {
        await localNotifications.cancel({ notifications: owned.map(({ id }) => ({ id })) });
      }
      // Capacitor 8.3 keeps delivered records in getPending after cancel().
      // Delivered .data is Android extras, not our extra.owner/taskId. Establish
      // ownership from stored metadata, then dismiss only the exact native pair.
      const stored = (await localNotifications.getPending()).notifications;
      const delivered = (await localNotifications.getDeliveredNotifications()).notifications;
      const remove = delivered.filter(item => item.tag == null &&
        (stored.some(row => row.id === item.id && matches(row)) ||
          !stored.some(row => row.id === item.id) && owned.some(row => row.id === item.id)));
      if (remove.length) await localNotifications.removeDeliveredNotifications({ notifications: remove });
      if ((await localNotifications.getPending()).notifications.some(matches) ||
          (await localNotifications.getDeliveredNotifications()).notifications.some(item => remove.some(row => row.id === item.id && row.tag == item.tag))) {
        throw new Error("لغو زنگ گوشی هنوز تأیید نشد.");
      }
      // A lost reply or a failed acknowledgement leaves the durable receipts intact.
      // Re-read current tasks: another synchronous save may have occurred during await.
      const next = tasks.map(task => task.id === snapshot.id ? { ...task,
        alarmCancellations: cancellationReceipts(task).filter(receipt => !receipts.some(old => old.id === receipt.id && old.taskId === receipt.taskId)),
      } : task);
      if (!saveTasks(next)) throw new Error("لغو انجام شد، اما رسید آن ذخیره نشد؛ دوباره تلاش کنید.");
    }
  }
  const localAlarmScheduler = alarmSounds.createDeviceAlarmScheduler({
    owner: "hamrah-local",
    getPending: () => localNotifications.getPending(),
    cancel: options => localNotifications.cancel(options),
    schedule: options => localNotifications.schedule(options),
    checkPermissions: () => localNotifications.checkPermissions(),
    prepareAlarm: () => alarmSounds.prepareAlarm(() => localNotifications.createChannel({
      id: channelId, name: "کارهای فوری عقب‌افتاده", sound: "urgent_alarm.wav", importance: 5, vibration: true,
    }), channelId),
    prepareNotification: async () => {
      await localNotifications.createChannel({id:"approved-local-notifications",name:"اعلان برنامه",importance:3,vibration:true});
      return "approved-local-notifications";
    },
  });
  async function scheduleNotification(task, kind = "task", requestPermission = true) {
    return enqueueAlarmWork(async () => {
      await drainAlarmCancellations();
      const current = kind === "test" ? task : tasks.find(item => item.id === task.id);
      if (!localNotifications || !current || current.done || current.archived || !current.deadline) return false;
      task = current;
      const version = alarmVersion(task);
      const stillCurrent = () => kind === "test" || tasks.some(item => item.id === task.id && !item.done && !item.archived && alarmVersion(item) === version);
      if (kind !== "test" && task.approvedPlan && !task.approvedPlan.channels.some(c=>c==="ALARM"||c==="NATIVE")) return false;
      const alarm=kind==="test" || !task.approvedPlan || task.approvedPlan.channels.includes("ALARM");
      let mapping = task.notificationSchedule;
      const oldIds = domain.notificationIds(task);
      if (mapping === undefined && oldIds.length && kind !== "test") {
        // Old IDs have no reliable time mapping: neither guess their times nor replay them.
        const pending = await localNotifications.getPending();
        alarmSyncNotice = "یادآوری‌های قدیمی حفظ شدند؛ موارد بدون زمان ذخیره‌شده دوباره ساخته نمی‌شوند.";
        return pending.notifications.some(item => oldIds.includes(item.id) && item.extra?.owner === "hamrah-local");
      }
      if (mapping !== undefined) {
        if (!mapping || mapping.version !== 1 || !Array.isArray(mapping.entries) ||
            mapping.entries.some(entry => !Number.isInteger(entry.id) || entry.id < 1 || entry.id > 2147483647 || !Number.isFinite(entry.at)) ||
            new Set(mapping.entries.map(entry => entry.id)).size !== mapping.entries.length ||
            !Array.isArray(task.notificationIds) || mapping.entries.length !== task.notificationIds.length ||
            mapping.entries.some(entry => !task.notificationIds.includes(entry.id))) {
          throw new Error("زمان و شناسه یادآوری ذخیره‌شده معتبر نیست؛ داده قبلی حفظ شد.");
        }
      } else {
        const times = kind === "test" ? [new Date(task.deadline).getTime()] : domain.notificationTimes(task, planner);
        if (times.some(time => !Number.isFinite(time))) throw new Error("زمان یادآوری معتبر نیست.");
        const usedIds = new Set(tasks.flatMap(domain.notificationIds));
        const nativePending = await localNotifications.getPending();
        if (!stillCurrent()) return false;
        for (const item of nativePending.notifications) usedIds.add(item.id);
        mapping = { version: 1, entries: [...new Set(times)].map(at => {
          let id; do { id = notificationId(); } while (usedIds.has(id)); usedIds.add(id); return {id, at};
        }) };
        const snapshot = {...task, notificationIds:mapping.entries.map(entry=>entry.id), notificationSchedule:mapping};
        // Persist even if permission is denied; later activation must reuse these exact times.
        if (kind !== "test" && !saveTasks(tasks.map(item => item.id === task.id ? snapshot : item))) {
          throw new Error("شناسه یادآوری ذخیره نشد؛ اعلان جدید تنظیم نشد.");
        }
        Object.assign(task, {notificationIds:snapshot.notificationIds, notificationSchedule:mapping});
      }
      // Mapping persistence changes notificationIds; capture the version after that write.
      const scheduledVersion = alarmVersion(task);
      const maySchedule = () => kind === "test" || tasks.some(item => item.id === task.id && !item.done && !item.archived && alarmVersion(item) === scheduledVersion);
      if (!maySchedule()) return false;
      if (!(await ensureNotificationAccess(false, requestPermission))) return false;
      if (!maySchedule()) return false;
      const result = await localAlarmScheduler.sync(async () => mapping.entries.map(entry => ({
        id: entry.id, at: entry.at, alarm,
        title: kind === "test" ? "آزمایش هشدار tia" : "یادآوری برنامه", body: task.title, largeBody: task.title,
        iconColor: "#5C70B4", extra: {kind, ...(task.id ? {taskId:task.id} : {})},
      })), {cancelObsolete:false});
      if (result.legacySound) alarmSyncNotice = alarmSounds.LEGACY_ALARM_SOUND_HELP;
      if (alarmSyncNotice) alarmStatus.textContent = alarmSyncNotice;
      if (!maySchedule()) return false; // The queued durable cancellation removes a late native write.
      return result.scheduled + result.retained > 0;
    });
  }
  async function cancelNotifications() {
    return enqueueAlarmWork(drainAlarmCancellations);
  }
  async function retryLocalAlarms() {
    await cancelNotifications();
    if (!localNotifications) return 0;
    let accepted = 0;
    for (const task of tasks.filter(item => !item.done && !item.archived && item.deadline)) {
      if (await scheduleNotification(task, "task", false)) accepted++;
    }
    return accepted;
  }

  function taskMarkup(task) {
    const deadline = task.deadline ? `<span class="tag">${escapeText(dateTime.format(new Date(task.deadline)))}</span>` : "";
    const actions = pendingDelete === task.id ? '<button class="text-button danger" data-action="confirm-delete" type="button">تأیید حذف</button><button class="text-button" data-action="cancel-delete" type="button">انصراف</button>' : '<button class="text-button" data-action="edit" type="button">ویرایش</button><button class="text-button danger" data-action="delete" type="button">حذف</button>';
    return `<article class="item${task.done ? " done" : ""}" data-id="${escapeText(task.id)}"><button class="check" data-action="toggle" type="button" aria-label="${task.done ? "بازگرداندن برنامه" : "انجام شد"}">${task.done ? "✓" : ""}</button><div><h3>${escapeText(task.title)}</h3><div class="meta"><span class="tag">${labels.category[task.category] || "شخصی"}</span><span class="tag ${escapeText(task.priority)}">${labels.priority[task.priority] || "عادی"}</span>${deadline}</div></div><div class="item-actions">${actions}</div></article>`;
  }
  function render() {
    const scope = overview.selectDashboardScope(tasks, panel, filter);
    const visible = overview.selectDashboardItems(tasks, panel, filter);
    list.innerHTML = visible.length ? visible.map(taskMarkup).join("") : '<span class="sr-only">برنامه‌ای در این فهرست نیست.</span>';
    $("#dashboard-overview").setAttribute("aria-label", panel === "today" ? "آمار برنامه‌های امروز، همه وضعیت‌ها" : "آمار فهرست فعلی، همه وضعیت‌ها");
    $("#dashboard-overview").innerHTML = overview.summarizeDashboardItems(scope).map(group=>`<article class="overview-card overview-${group.key}" aria-label="${group.name}"><span dir="ltr">${group.label}</span><strong>${toFa(group.total)}</strong><small>${toFa(group.done)} انجام‌شده</small></article>`).join("");
    const dated = overview.selectDashboardItems(tasks, "tasks").filter((task) => task.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
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
      const hasTask = tasks.some((task) => !task.done && !task.archived && task.deadline && domain.localDateInput(task.deadline).slice(0, 10) === key);
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
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton.disabled || !modal.classList.contains("open")) return;
    const submitGeneration = form.submitGeneration;
    const notify = text => { if (submitGeneration === form.submitGeneration) $("#page-status").textContent = text; };
    submitButton.disabled = true;
    clearTimeout(form.saveNoticeTimer);
    $("#page-status").textContent = "";
    try {
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (!title) return;
    const existing = tasks.find((task) => task.id === data.get("id"));
    const deadlineValue = String(data.get("deadline") || "");
    if(deadlineValue && (!window.HamrahInputs.persianParts(deadlineValue.split("T")[0])||!window.HamrahInputs.validTime24(deadlineValue.split("T")[1]||""))){$("#form-reminders").textContent="تاریخ شمسی و ساعت ۲۴ساعته معتبر وارد کن.";return;}
    if (submitGeneration !== form.submitGeneration) return;
    const task = reserveAlarmCancellations(existing, { ...existing, id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title, category: String(data.get("category") || "personal"), priority: String(data.get("priority") || "normal"), deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null, reminderOffsets: existing?.approvedPlan ? existing.approvedPlan.reminderOffsets : domain.normalizeOffsets(existing ? existing.reminderOffsets : reminderOffsets), urgentRepeatPolicy: domain.manualRepeatPolicy(existing, repeatSettings), notificationIds: [], notificationId: undefined, notificationSchedule: undefined, done: existing?.done || false, updatedAt:new Date().toISOString() });
    if(task.approvedPlan){task.approvedPlan={...task.approvedPlan,quietStart:"00:00",quietEnd:"00:00"};}
    if(task.approvedPlan?.durationMinutes && task.deadline)task.endsAt=new Date(Date.parse(task.deadline)+task.approvedPlan.durationMinutes*60000).toISOString();
    const next = existing ? tasks.map((item) => item.id === task.id ? task : item) : [task, ...tasks];
    if (!saveTasks(next)) { render(); return; }
    $("#task-id").value = task.id;
    closeForm(); filter = "all";
    $$(`[data-filter]`).forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
    showPanel("today");
    notify("done — فقط روی این دستگاه ذخیره شد.");
    // Persistence is complete. A slow native bridge must not lock the next form.
    // The closed-modal guard rejects duplicate submits; the generation guards
    // prevent an older alarm result from changing a newer form's feedback.
    submitButton.disabled = false;
    try { if (existing) await cancelNotifications(); }
    catch { notify("done — تغییر ذخیره شد؛ لغو زنگ قبلی هنوز تأیید نشد. از تنظیمات دوباره تلاش کن."); return; }
    if (task.deadline && !task.done) {
      try { const scheduled = await scheduleNotification(task); notify(scheduled ? "done — فقط روی این دستگاه ذخیره شد؛ یادآوری‌ها تنظیم شدند." : "done — فقط روی این دستگاه ذخیره شد؛ یادآوری به زمان آینده و اجازه اعلان نیاز دارد."); }
      catch { notify("done — فقط روی این دستگاه ذخیره شد، اما تنظیم یادآوری کامل نشد؛ از تنظیمات دوباره تلاش کن."); }
    }
    if (submitGeneration !== form.submitGeneration) return;
    const saveNotice = $("#page-status").textContent;
    form.saveNoticeTimer = setTimeout(() => { if (submitGeneration === form.submitGeneration && $("#page-status").textContent === saveNotice) $("#page-status").textContent = saveNotice.replace(/^done — /, ""); }, 5000);
    } finally { if (submitGeneration === form.submitGeneration) submitButton.disabled = false; }
  });
  async function handleListAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.closest("[data-id]")?.dataset.id;
    const task = tasks.find((item) => item.id === id);
    if (!task || task.done || task.archived || pendingActions.has(id)) return;
    if (button.dataset.action === "edit") { openForm(task); return; }
    if (button.dataset.action === "delete") { pendingDelete = id; render(); return; }
    if (button.dataset.action === "cancel-delete") { pendingDelete = ""; render(); return; }
    pendingActions.add(id);
    try {
      if (button.dataset.action === "toggle") {
        if (!saveTasks(tasks.map(item => item.id === id ? reserveAlarmCancellations(item, { ...item, done: true, updatedAt: new Date().toISOString() }) : item))) { render(); return; }
        render();
        await cancelNotifications();
      }
      if (button.dataset.action === "confirm-delete") {
        if (!saveTasks(tasks.map(item => item.id === id ? reserveAlarmCancellations(item, { ...item, archived: true, updatedAt: new Date().toISOString() }) : item))) { render(); return; }
        pendingDelete = "";
        render();
        await cancelNotifications();
      }
    } catch { $("#page-status").textContent = "تغییر ذخیره شد؛ لغو زنگ هنوز تأیید نشد. از تنظیمات دوباره تلاش کن."; render(); return; }
    finally { pendingActions.delete(id); }
    render();
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
  function immutablePlan(value) {
    const freeze = item => {
      if (item && typeof item === "object") { Object.values(item).forEach(freeze); Object.freeze(item); }
      return item;
    };
    return freeze(JSON.parse(JSON.stringify(value)));
  }
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
      ...(p.escalation?[["تعداد هشدار پس از موعد","repeatCount","number",p.repeatCount],...(p.repeatCount>0?[["فاصله پیگیری هشدار (دقیقه)","repeatMinutes","number",p.repeatMinutes]]:[])]:[]),

    ];
    const choices=(key,values)=>'<label>'+({category:"دسته",priority:"اولویت",recurrence:"تکرار برنامه"}[key])+'<select data-plan="'+key+'">'+Object.entries(values).map(([v,label])=>'<option value="'+v+'"'+(p[key]===v?' selected':'')+'>'+label+'</option>').join("")+'</select></label>';
    root.innerHTML='<h3>پیش‌نمایش تأیید — نسخه '+toFa(agentDraft.revision)+'</h3><p>پردازش محلی؛ بدون ارسال اطلاعات. </p><p>'+escapeText(extraMessage)+'</p><div class="form-grid">'+fields.map(([label,key,type,value])=>'<label class="field">'+label+'<input data-plan="'+key+'" type="'+type+'" value="'+escapeText(String(value))+'"/></label>').join("")+choices("priority",{NORMAL:"عادی",IMPORTANT:"مهم",URGENT:"فوری"})+choices("recurrence",{NONE:"ندارد",DAILY:"روزانه",WEEKLY:"هفتگی"})+'</div><div class="reminder-options">'+[1440,180,60].map(m=>'<label><input type="checkbox" data-offset="'+m+'" '+(p.reminderOffsets.includes(m)?"checked":"")+'>'+offsetLabels[m]+'</label>').join("")+'</div><div class="reminder-options">'+Object.entries({IN_APP:"داخل برنامه",PUSH:"Push؛ نیازمند اتصال",NATIVE:"Notification",ALARM:"Alarm گوشی"}).map(([v,label])=>'<label><input type="checkbox" data-channel="'+v+'" '+(p.channels.includes(v)?"checked":"")+'>'+label+'</label>').join("")+'</div><label><input type="checkbox" id="local-escalation" '+(p.escalation?"checked":"")+'>تشدید هشدار فوری پس از موعد</label><p>'+p.defaults.map(escapeText).join("؛ ")+'</p>'+[...check.questions,...check.warnings].map(t=>'<p>'+escapeText(t)+'</p>').join("")+'<p>تبدیل صوت روی همین دستگاه انجام می‌شود؛ متن پیشنهادی فقط پس از تأیید ثبت می‌شود. تماس و پیامک واقعی غیرفعال‌اند.</p><div class="settings-actions"><button id="local-plan-confirm" class="primary" '+''+'>ثبت</button><button id="local-plan-cancel" class="secondary">انصراف</button></div><p id="local-plan-status" role="status"></p>';
    const grid=root.querySelector(".form-grid");
    const repeatInput=root.querySelector('[data-plan="repeatCount"]');
    if(repeatInput){repeatInput.min="0";repeatInput.max="6";repeatInput.step="1";}
    const intervalInput=root.querySelector('[data-plan="repeatMinutes"]');
    if(intervalInput){intervalInput.min="10";intervalInput.max="1440";intervalInput.step="1";}
    const operation=document.createElement("p");operation.textContent=({CREATE:"ثبت مورد جدید",UPDATE:"ویرایش مورد انتخاب‌شده",COMPLETE:"تکمیل مورد انتخاب‌شده",DELETE:"حذف و بایگانی مورد انتخاب‌شده"})[p.operation];grid.before(operation);
    const changed=(rebuild=true)=>{
      if(agentBusy || agentDraft?.status!=="PENDING")return;
      planner.normalizePlanForReview(p,planningItems());
      agentDraft.revision++;agentDraft.questions=[];
      try { localStorage.setItem(draftKey,JSON.stringify(agentDraft)); }
      catch { $("#local-plan-status").textContent="پیشنهاد ذخیره نشد؛ دوباره ویرایش کن و پیام حافظه را بررسی کن.";return; }
      if(rebuild)showAgentDraft("جزئیات تغییر کرد؛ نسخه تازه را بررسی و ثبت کن.");
      else { updatePreview();$("#local-plan-status").textContent="جزئیات تغییر کرد؛ نسخه تازه را بررسی و ثبت کن."; }
    };
    const categoryLabel=document.createElement("label");categoryLabel.textContent="دسته‌بندی";const categorySelect=document.createElement("select");
    for(const [v,label] of Object.entries({PERSONAL:"شخصی",WORK:"شرکتی",MEETING:"جلسه"})){if(p.operation!=="CREATE"&&((p.entity==="MEETING")!==(v==="MEETING")))continue;categorySelect.add(new Option(label,v));}
    categorySelect.value=p.entity==="MEETING"?"MEETING":p.category;categorySelect.onchange=()=>{if(agentBusy || agentDraft?.status!=="PENDING")return;p.entity=categorySelect.value==="MEETING"?"MEETING":"TASK";if(p.entity==="TASK")p.category=categorySelect.value;changed();};categoryLabel.append(categorySelect);grid.append(categoryLabel);
    for(const [key,label] of [["date","تاریخ شمسی"],["time","ساعت ۲۴ساعته"]]){const wrapper=document.createElement("label");wrapper.textContent=label;const control=document.createElement("span");wrapper.append(control);grid.append(wrapper);window.HamrahControls[key](control,p[key],v=>{if(agentBusy || agentDraft?.status!=="PENDING")return;p[key]=v;if(key==="time")p.ambiguousTime=null;changed(false);});}
    const actions=root.querySelector(".settings-actions"), editButton=document.createElement("button");
    editButton.className="secondary";editButton.textContent="ویرایش";editButton.onclick=()=>{if(agentBusy)return;root.querySelector('.approval-details').open=true;root.scrollIntoView({block:'start'});root.querySelector('[data-plan="title"]').focus();resizeApproval();};actions.insertBefore(editButton,$("#local-plan-cancel"));
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
    const compact=document.createElement('div');compact.className='approval-summary';compact.setAttribute('aria-label','خلاصه پیشنهاد');
    const operationTitle=document.createElement('h3');operationTitle.textContent=({CREATE:'بررسی پیش از ایجاد',UPDATE:'بررسی پیش از ویرایش',COMPLETE:'بررسی پیش از تکمیل',DELETE:'بررسی پیش از حذف و بایگانی'})[p.operation];
    function updatePreview() {
      const summary=planner.approvalSummary(p), currentCheck=planner.inspectPlan(p,new Date(),planningItems());
      compact.innerHTML='<h3>'+escapeText(p.title||'عنوان تعیین نشده')+'</h3><p>'+escapeText(summary.category+' · '+summary.priority+' · '+summary.when)+'</p><p>یادآوری: '+escapeText(summary.reminders)+'</p><p>هشدار: '+escapeText(summary.channels)+'</p>'+(summary.recurrence?'<p>تکرار برنامه: '+escapeText(summary.recurrence)+'</p>':'')+(summary.followUp?'<p>'+escapeText(summary.followUp)+'</p>':'');
      for(const warning of [...currentCheck.questions,...currentCheck.warnings,...(p.channels.some(c=>c==='PUSH'||c==='IN_APP')?['Push و مرکز اعلان حساب در حالت محلی فعال نیستند.']:[]),...(p.operation==='DELETE'?['این تأیید، مورد انتخاب‌شده را حذف و هشدارهای آن را لغو می‌کند.']:[])]){const note=document.createElement('p');note.className='approval-warning';note.textContent=warning;compact.append(note);}
      timeline.replaceChildren();
      for(const entry of planner.plannedReminderTimes(p)){const line=document.createElement('li');line.textContent=entry.offset+' دقیقه قبل: '+localTime.format(new Date(entry.scheduledFor));timeline.append(line);}
      const revision=editor.querySelector('h3');if(revision)revision.textContent='پیش‌نمایش تأیید — نسخه '+toFa(agentDraft.revision);
    }
    updatePreview();
    for(const m of p.reminderOffsets.filter(m=>![1440,180,60].includes(m))){const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.dataset.offset=String(m);label.append(checkbox,document.createTextNode(toFa(m)+' دقیقه قبل'));editor.append(label);}
    root.replaceChildren(operationTitle,compact,actions,details,statusNode);
    details.addEventListener('toggle',resizeApproval);resizeApproval();
    root.querySelectorAll("[data-plan],[data-offset],[data-channel],#local-escalation").forEach(input=>input.addEventListener("change",()=>{
      if(agentBusy || agentDraft?.status!=="PENDING")return;
      if(input.dataset.plan) {const key=input.dataset.plan;p[key]=["durationMinutes","occurrenceCount","repeatCount","repeatMinutes"].includes(key)?(input.value?Number(input.value):null):input.value;}
      if(input.dataset.offset){const m=Number(input.dataset.offset);p.reminderOffsets=input.checked?[...new Set([...p.reminderOffsets,m])].sort((a,b)=>b-a):p.reminderOffsets.filter(v=>v!==m);}
      if(input.dataset.channel){const c=input.dataset.channel;p.channels=input.checked?[...new Set([...p.channels,c])]:p.channels.filter(v=>v!==c);}
      if(input.id==="local-escalation")p.escalation=input.checked;
      changed(input.dataset.plan==="recurrence" || input.dataset.plan==="repeatCount" || input.id==="local-escalation");
    }));
    $("#local-plan-cancel").onclick=()=>{if(agentBusy || agentDraft?.status!=="PENDING")return;try{localStorage.setItem(draftKey,JSON.stringify({...agentDraft,status:"CANCELLED"}));agentDraft=null;showAgentDraft("لغو شد؛ چیزی ثبت یا زمان‌بندی نشد.");}catch{$("#local-plan-status").textContent="لغو پیشنهاد ذخیره نشد؛ دوباره تلاش کن.";}};
    $("#local-plan-confirm").onclick=async()=>{
      if(agentBusy || agentDraft?.status!=="PENDING")return;
      agentBusy=true;
      const controls=[...root.querySelectorAll("input,select,button")].map(node=>({node,disabled:node.disabled}));
      controls.forEach(({node})=>{node.disabled=true;});root.setAttribute("aria-busy","true");
      try{
        const stored=JSON.parse(localStorage.getItem(draftKey)||"null");
        if(!stored||stored.id!==agentDraft.id||stored.revision!==agentDraft.revision||stored.status!=="PENDING"||JSON.stringify(stored.plan)!==JSON.stringify(p))throw new Error("نسخه پیشنهاد تغییر کرده است.");
        const approved=immutablePlan(p), receipt={id:stored.id,revision:stored.revision};
        if(tasks.some(task=>task.approvalReceipt?.id===receipt.id && task.approvalReceipt.revision===receipt.revision)){
          agentDraft=null;await retryLocalAlarms();showAgentDraft("این پیشنهاد قبلاً ثبت شده است؛ دوباره ایجاد نشد.");render();return;
        }
        const errors=[...planner.inspectPlan(approved,new Date(),planningItems()).questions,...(agentDraft.questions||[])];
        if(errors.length){
          details.open=true;
          root.querySelectorAll("[data-approval-error]").forEach(e=>e.remove());
          for(const [selector,pattern] of [['[data-plan="title"]',/عنوان/],['input[aria-label="تاریخ شمسی"]',/تاریخ|روز/],['input[aria-label="ساعت ۲۴ساعته"]',/ساعت|زمان/],['[data-plan="repeatCount"]',/تعداد هشدار/],['[data-plan="repeatMinutes"]',/فاصله هشدار/],['[data-plan="occurrenceCount"]',/نوبت/]]){
            const message=errors.find(e=>pattern.test(e)),field=root.querySelector(selector);
            if(message&&field){field.setAttribute("aria-invalid","true");const hint=document.createElement("small");hint.dataset.approvalError="true";hint.className="field-error";hint.textContent=message;field.closest("label").append(hint);}
          }
          throw new Error(errors[0]);
        }
        const existing=approved.targetId?tasks.find(t=>t.id===approved.targetId):null;
        if(approved.operation!=="CREATE" && (!existing||existing.done||existing.archived||(existing.updatedAt||existing.id)!==approved.targetUpdatedAt))throw new Error("مورد انتخاب‌شده تغییر کرده؛ دوباره درخواست بده.");
        const instant=planner.planInstant(approved.date,approved.time,approved.timezone);
        const task=reserveAlarmCancellations(existing,{...existing,id:existing?.id||receipt.id,title:approved.title,category:approved.entity==="MEETING"?"meeting":approved.category==="WORK"?"company":"personal",priority:approved.priority.toLowerCase(),deadline:instant?.toISOString()??null,endsAt:instant&&approved.durationMinutes?new Date(instant.getTime()+approved.durationMinutes*60000).toISOString():null,reminderOffsets:approved.reminderOffsets,notificationIds:[],notificationId:undefined,notificationSchedule:undefined,done:approved.operation==="COMPLETE",archived:approved.operation==="DELETE",updatedAt:new Date().toISOString(),approvedPlan:approved,approvalReceipt:receipt});
        const series=approved.operation==="CREATE"&&approved.recurrence!=="NONE"?planner.planOccurrences(approved).map((o,i)=>({...task,id:i?task.id+"-"+i:task.id,deadline:o.instant,notificationIds:[],endsAt:o.instant&&approved.durationMinutes?new Date(Date.parse(o.instant)+approved.durationMinutes*60000).toISOString():null})):[task];
        const next=existing?tasks.map(t=>t.id===task.id?task:t):[...series,...tasks];
        if(!saveTasks(next)) {
          throw new Error("ثبت انجام نشد؛ اطلاعات قبلی حفظ شده است. پیام حافظه را بررسی کنید.");
        }
        // No await precedes this atomic task/receipt commit. A failed save leaves
        // the draft PENDING; a failed draft acknowledgement cannot replay this receipt.
        try{localStorage.setItem(draftKey,JSON.stringify({...stored,status:"EXECUTED"}));}catch{/* The task-store receipt is authoritative. */}
        agentDraft=null;render();
        let result="ثبت محلی انجام شد؛ هنوز با حساب سرور همگام نشده است.";
        if(approved.channels.includes("PUSH"))result+=" Push در حالت آفلاین ارسال نمی‌شود.";
        try{
          await cancelNotifications();
          if((approved.operation==="CREATE"||approved.operation==="UPDATE")&&approved.channels.some(c=>c==="ALARM"||c==="NATIVE")){let scheduled=0;for(const item of series){if(await scheduleNotification(item))scheduled++;}result+=scheduled===series.length?" Notification تنظیم شد.":" برخی اعلان‌ها تنظیم نشدند؛ زمان آینده و اجازه گوشی لازم است.";}
        }catch{result+=" تغییر ذخیره شد؛ لغو یا تنظیم زنگ کامل نشد. از تنظیمات دوباره تلاش کن.";}
        showAgentDraft(result);render();
      }catch(error){statusNode.textContent=error.message||"ثبت انجام نشد؛ دوباره بررسی کن.";}finally{agentBusy=false;controls.forEach(({node,disabled})=>{node.disabled=disabled;});root.setAttribute("aria-busy","false");}
    };
  }
  function replyToMessage() {
    const message=$("#assistant-input").value.trim();if(!message||agentBusy)return;
    const previous=agentDraft?.status==="PENDING"?agentDraft.plan:null;
    const result=planner.planPersian(message,{timezone:"Asia/Tehran",previous,items:planningItems(),offsets:reminderOffsets,...(!previous && repeatSettings ? repeatSettings : {})});
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

  let enablingNotifications = false;
  $("#enable-notifications").addEventListener("click", async () => {
    if (enablingNotifications) return;
    enablingNotifications = true; $("#enable-notifications").disabled = true; alarmSyncNotice = "";
    try {
      await cancelNotifications();
      if (await ensureNotificationAccess(true)) {
        const accepted = await retryLocalAlarms();
        alarmStatus.textContent = `${toFa(accepted)} برنامه دارای یادآوری تنظیم‌شده است؛ زمان زنگ‌های قبلی حفظ شد. ${alarmSyncNotice}`;
      }
    } catch { alarmStatus.textContent = "فعال‌سازی اعلان کامل نشد؛ دوباره تلاش کنید."; }
    finally { enablingNotifications = false; $("#enable-notifications").disabled = false; }
  });
  let testingAlarm = false;
  $("#test-alarm").addEventListener("click", async () => {
    if (testingAlarm) return;
    testingAlarm = true; $("#test-alarm").disabled = true; alarmSyncNotice = "";
    try {
      const task = {title:"این هشدار برای کنترل عملکرد زنگ است.",deadline:new Date(Date.now()+30000).toISOString()};
      const ok = await scheduleNotification(task, "test");
      alarmStatus.textContent = ok ? `هشدار تنظیم شد و حدود ۳۰ ثانیه دیگر نمایش داده می‌شود. ${alarmSyncNotice}` : "ابتدا اجازه اعلان را فعال کنید.";
    } catch { alarmStatus.textContent = "تنظیم هشدار آزمایشی ناموفق بود."; }
    finally { testingAlarm = false; $("#test-alarm").disabled = false; }
  });
  $$("input[name=reminder]").forEach((input) => { input.checked = reminderOffsets.includes(Number(input.value)); });
  $("#reminder-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const selected = $$("input[name=reminder]:checked").map((input) => Number(input.value));
    if (!selected.length) { $("#reminder-status").textContent = "حداقل یک زمان را انتخاب کن."; return; }
    try { localStorage.setItem(preferenceKey, JSON.stringify(selected)); reminderOffsets = selected; $("#reminder-status").textContent = "تنظیمات برای برنامه‌های جدید ذخیره شد."; }
    catch { $("#reminder-status").textContent = "ذخیره تنظیمات انجام نشد؛ فضای دستگاه را بررسی کن."; }
  });
  const repeatCountInput = $("#urgent-max-repeats"), repeatMinutesInput = $("#urgent-repeat-minutes");
  const repeatSettingsStatus = $("#repeat-settings-status");
  const shownRepeatSettings = repeatSettings || domain.repeatSettingsDefaults;
  repeatCountInput.value = String(shownRepeatSettings.repeatCount);
  repeatMinutesInput.value = String(shownRepeatSettings.repeatMinutes);
  function showRepeatInterval() {
    const zero = repeatCountInput.value === "0";
    $("#urgent-repeat-interval-field").hidden = zero;
    repeatMinutesInput.disabled = zero;
  }
  repeatCountInput.addEventListener("change", showRepeatInterval);
  showRepeatInterval();
  repeatSettingsStatus.textContent = !loadedRepeatSettings.ok ? "خواندن تنظیم تکرار ممکن نشد؛ داده قبلی حفظ شده است. ذخیره انجام نمی‌شود."
    : repeatSettings ? domain.repeatSummary(repeatSettings) : "هنوز ذخیره نشده؛ برنامه‌های قبلی و رفتار قبلی حفظ شده‌اند.";
  $("#repeat-settings-form").addEventListener("submit", event => {
    event.preventDefault();
    const value = { repeatCount: Number(repeatCountInput.value), repeatMinutes: repeatCountInput.value === "0" ? (repeatSettings || domain.repeatSettingsDefaults).repeatMinutes : Number(repeatMinutesInput.value) };
    const saved = repeatSettingsStore.save(value);
    if (!saved.ok) { repeatSettingsStatus.textContent = "ذخیره نشد؛ تعداد ۰ تا ۶ و فاصله ۱۰ تا ۱۴۴۰ دقیقه لازم است. اگر حافظه یا پنجره دیگری تغییر کرده، صفحه را دوباره باز کنید."; return; }
    repeatSettings = saved.value;
    repeatMinutesInput.value = String(repeatSettings.repeatMinutes);
    repeatSettingsStatus.textContent = "برای ثبت‌های جدید ذخیره شد. " + domain.repeatSummary(repeatSettings);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeForm(); });
  function renderHeader() {
    const now = new Date();
    $("#today").textContent = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", weekday: "long", day: "numeric", month: "long" }).format(now);
    $("#gregorian-date").textContent = new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { timeZone: "Asia/Tehran", day: "numeric", month: "long", year: "numeric" }).format(now);
    const title = $("#page-title");
    title.classList.toggle("daily-poem", panel === "today");
    $("#poem-next").hidden = panel !== "today";
    poemHost.hidden = panel !== "today";
    if (panel === "today") { const lines = personalPoem || window.HamrahPoems[poemNavigator.current()]; title.setAttribute("aria-label", `${personalPoem ? "شعر خودم" : "شعر روز مولانا"}: ${lines.join("، ")}`); title.innerHTML = [0,2].map(i => `<span class="poem-couplet"><span>${escapeText(lines[i])}</span><span>${escapeText(lines[i+1])}</span></span>`).join(""); }
    else { title.removeAttribute("aria-label"); title.textContent = { tasks: "همه کارها و جلسات", calendar: "تقویم من", assistant: "", settings: "تنظیمات من", notifications: "اعلان‌ها" }[panel]; }
  }
  document.querySelectorAll('[data-appearance]').forEach(button=>button.addEventListener('click',()=>{
    const saved=window.HamrahAppearance?.set(button.dataset.appearance);
    $('#appearance-status').textContent=saved?'':'انتخاب فعلی اعمال شد؛ ذخیره روی این دستگاه ممکن نیست.';
  }));
  const updateAppearance=()=>document.querySelectorAll('[data-appearance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearance===window.HamrahAppearance?.get())));
  window.addEventListener('hamrah-appearance',updateAppearance);
  updateAppearance();
  const poemEditor = overview.mountPersonalPoemEditor(poemHost, { scope:"guest", day:overview.tehranDayKey, storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)}, onChange:lines=>{personalPoem=lines;renderHeader();} });
  overview.observePoemLayout(poemEditor.poem);
  renderHeader();
  $("#poem-next").addEventListener("click", () => { if(personalPoem && !poemEditor.useDaily())return; poemNavigator.next(); renderHeader(); });
  let renderedDay = overview.tehranDayKey();
  setInterval(() => { renderHeader(); const day=overview.tehranDayKey(); if(day!==renderedDay){renderedDay=day;render();} }, 30000);
  window.addEventListener("storage", renderHeader);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderHeader(); render(); } });
  showPanel(panel);
  // Reconcile durable cancellations even for hidden completed/deleted records,
  // then retry only missing future alarms with their persisted IDs and times.
  void retryLocalAlarms().catch(()=>{alarmStatus.textContent="لغو یا تنظیم زنگ‌های ذخیره‌شده کامل نشد؛ از تنظیمات دوباره تلاش کن.";});
})();
