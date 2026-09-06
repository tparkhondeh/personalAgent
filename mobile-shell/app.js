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
    if (!task.deadline || task.done || !(await ensureNotificationAccess(false))) return false;
    const times = kind === "test" ? [new Date(task.deadline).getTime()] : domain.reminderTimes(task);
    if (!times.length) return false;
    const usedIds = new Set(tasks.flatMap(domain.notificationIds));
    task.notificationIds = times.map(() => { let id; do { id = notificationId(); } while (usedIds.has(id)); usedIds.add(id); return id; });
    // Persist IDs before scheduling so completion/retry can cancel a partial native delivery.
    if (kind !== "test") saveTasks();
    await localNotifications.schedule({ notifications: times.map((time, index) => ({ id: task.notificationIds[index], title: kind === "test" ? "آزمایش هشدار همراه" : "یادآوری برنامه", body: task.title, largeBody: task.title, channelId, sound: "urgent_alarm.wav", smallIcon: "ic_stat_hamrah", iconColor: "#5C70B4", autoCancel: true, schedule: { at: new Date(time), allowWhileIdle: true }, extra: { owner: "hamrah-local", kind } })) });
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
    const scoped = panel === "today" ? tasks.filter((task) => !task.done && (!task.deadline || new Date(task.deadline) <= endOfToday)) : tasks;
    const visible = filter === "all" ? scoped : scoped.filter((task) => task.category === filter);
    list.innerHTML = visible.length ? visible.map(taskMarkup).join("") : '<div class="empty"><strong>هنوز برنامه‌ای ثبت نشده</strong>با دکمه «برنامه جدید» اولین مورد را اضافه کنید.</div>';
    $("#all-count").textContent = toFa(tasks.length);
    $("#done-count").textContent = toFa(tasks.filter((task) => task.done).length);
    $("#urgent-count").textContent = toFa(tasks.filter((task) => task.priority === "urgent" && !task.done).length);
    const dated = tasks.filter((task) => task.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
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
      const hasTask = tasks.some((task) => task.deadline && domain.localDateInput(task.deadline).slice(0, 10) === key);
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
    const task = { id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title, category: String(data.get("category") || "personal"), priority: String(data.get("priority") || "normal"), deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null, reminderOffsets: domain.normalizeOffsets(existing?.reminderOffsets || reminderOffsets), notificationIds: [], done: existing?.done || false };
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
      if (button.dataset.action === "toggle") { await cancelNotifications(task); task.done = !task.done; saveTasks(); if (!task.done) await scheduleNotification(task); }
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
  function replyToMessage() {
    const open = tasks.filter((task) => !task.done);
    const urgent = open.filter((task) => task.priority === "urgent");
    const next = [...open].filter((task) => task.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
    $("#assistant-result").hidden = false;
    const freeTime = /آزاد|استراحت/.test($("#assistant-input").value);
    $("#assistant-result").textContent = freeTime ? `برای زمان آزاد، یک استراحت کوتاه یا پیاده‌روی در نظر بگیر.${urgent.length ? " ابتدا کارهای فوری را مرور کن." : ""}` : open.length ? `در حال حاضر ${toFa(open.length)} برنامه باز داری${urgent.length ? ` که ${toFa(urgent.length)} مورد فوری است` : ""}.${next ? ` نزدیک‌ترین زمان مربوط به «${next.title}» است.` : " بهتر است یک زمان مشخص برای مهم‌ترین کار تعیین کنی."}` : "همه برنامه‌ها انجام شده‌اند. زمان خوبی برای مرور برنامه بعدی است.";
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
