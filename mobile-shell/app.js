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
  let filter = "all";
  let tasks = loadTasks();

  function loadTasks() { try { const value = JSON.parse(localStorage.getItem(storageKey) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
  function saveTasks() { localStorage.setItem(storageKey, JSON.stringify(tasks)); }
  function notificationId() { return Math.floor(Date.now() % 2000000000); }
  function toFa(value) { return Number(value).toLocaleString("fa-IR"); }
  function escapeText(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }

  function openForm(task) {
    form.reset();
    $("#task-id").value = task?.id || "";
    $("#task-title").value = task?.title || "";
    $("#task-category").value = task?.category || "personal";
    $("#task-priority").value = task?.priority || "normal";
    $("#task-deadline").value = task?.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "";
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
    if (!task.deadline || !(await ensureNotificationAccess(false))) return false;
    const at = new Date(Math.max(Date.now() + 1500, new Date(task.deadline).getTime()));
    await localNotifications.schedule({ notifications: [{ id: task.notificationId, title: kind === "test" ? "آزمایش هشدار همراه" : "یادآوری برنامه", body: task.title, largeBody: task.title, channelId, sound: "urgent_alarm.wav", smallIcon: "ic_stat_hamrah", iconColor: "#5C70B4", autoCancel: true, schedule: { at, allowWhileIdle: true }, extra: { owner: "hamrah-local", kind } }] });
    return true;
  }
  async function cancelNotification(id) { if (!localNotifications || !id) return; try { await localNotifications.cancel({ notifications: [{ id }] }); } catch {} }

  function taskMarkup(task) {
    const deadline = task.deadline ? `<span class="tag">${escapeText(dateTime.format(new Date(task.deadline)))}</span>` : "";
    return `<article class="item${task.done ? " done" : ""}" data-id="${escapeText(task.id)}"><button class="check" data-action="toggle" type="button" aria-label="${task.done ? "بازگرداندن برنامه" : "انجام شد"}">${task.done ? "✓" : ""}</button><div><h3>${escapeText(task.title)}</h3><div class="meta"><span class="tag">${labels.category[task.category] || "شخصی"}</span><span class="tag ${escapeText(task.priority)}">${labels.priority[task.priority] || "عادی"}</span>${deadline}</div></div><div class="item-actions"><button class="text-button" data-action="edit" type="button">ویرایش</button><button class="text-button danger" data-action="delete" type="button">حذف</button></div></article>`;
  }
  function render() {
    const visible = filter === "all" ? tasks : tasks.filter((task) => task.category === filter);
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
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const days = new Date(year, month + 1, 0).getDate();
    $("#calendar-month").textContent = new Intl.DateTimeFormat("fa-IR", { month: "long", year: "numeric" }).format(now);
    const cells = ["ش", "ی", "د", "س", "چ", "پ", "ج"].map((name) => `<div class="day-name">${name}</div>`);
    for (let index = 0; index < (first.getDay() + 1) % 7; index += 1) cells.push("<div></div>");
    for (let day = 1; day <= days; day += 1) {
      const hasTask = tasks.some((task) => { if (!task.deadline) return false; const date = new Date(task.deadline); return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day; });
      cells.push(`<div class="day${day === now.getDate() ? " today" : ""}${hasTask ? " has-task" : ""}">${toFa(day)}</div>`);
    }
    $("#calendar-grid").innerHTML = cells.join("");
  }
  function showPanel(name, clicked) {
    $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${name}-panel`));
    $$(".nav-button").forEach((button) => button.classList.remove("active"));
    if (clicked) clicked.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (!title) return;
    const existing = tasks.find((task) => task.id === data.get("id"));
    const deadlineValue = String(data.get("deadline") || "");
    if (existing) await cancelNotification(existing.notificationId);
    const task = { id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title, category: String(data.get("category") || "personal"), priority: String(data.get("priority") || "normal"), deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null, notificationId: deadlineValue ? notificationId() : null, done: existing?.done || false };
    tasks = existing ? tasks.map((item) => item.id === task.id ? task : item) : [task, ...tasks];
    saveTasks(); render(); closeForm();
    if (task.deadline) { const scheduled = await scheduleNotification(task); alarmStatus.textContent = scheduled ? "برنامه ذخیره و یادآوری تنظیم شد." : "برنامه ذخیره شد؛ اجازه اعلان برای یادآوری لازم است."; }
  });
  async function handleListAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.closest("[data-id]")?.dataset.id;
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    if (button.dataset.action === "edit") { openForm(task); return; }
    if (button.dataset.action === "toggle") { task.done = !task.done; if (task.done) await cancelNotification(task.notificationId); }
    if (button.dataset.action === "delete") { await cancelNotification(task.notificationId); tasks = tasks.filter((item) => item.id !== id); }
    saveTasks(); render();
  }
  list.addEventListener("click", handleListAction);
  datedList.addEventListener("click", handleListAction);
  $$(`[data-open-form]`).forEach((button) => button.addEventListener("click", () => openForm()));
  $("#close-form").addEventListener("click", closeForm);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeForm(); });
  $$(`[data-filter]`).forEach((button) => button.addEventListener("click", () => { filter = button.dataset.filter; $$(`[data-filter]`).forEach((item) => item.classList.toggle("active", item === button)); render(); }));
  $$(`[data-panel]`).forEach((button) => button.addEventListener("click", () => showPanel(button.dataset.panel, button)));
  $("#assistant-send").addEventListener("click", () => {
    const open = tasks.filter((task) => !task.done);
    const urgent = open.filter((task) => task.priority === "urgent");
    const next = [...open].filter((task) => task.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
    $("#assistant-result").textContent = open.length ? `در حال حاضر ${toFa(open.length)} برنامه باز داری${urgent.length ? ` که ${toFa(urgent.length)} مورد فوری است` : ""}.${next ? ` نزدیک‌ترین زمان مربوط به «${next.title}» است.` : " بهتر است یک زمان مشخص برای مهم‌ترین کار تعیین کنی."}` : "همه برنامه‌ها انجام شده‌اند. زمان خوبی برای مرور برنامه بعدی است.";
  });
  $("#enable-notifications").addEventListener("click", async () => { try { await ensureNotificationAccess(true); } catch { alarmStatus.textContent = "فعال‌سازی اعلان کامل نشد؛ دوباره تلاش کنید."; } });
  $("#test-alarm").addEventListener("click", async () => { try { const task = { title: "این هشدار برای کنترل عملکرد زنگ است.", deadline: new Date(Date.now() + 30000).toISOString(), notificationId: notificationId() }; const ok = await scheduleNotification(task, "test"); alarmStatus.textContent = ok ? "هشدار تنظیم شد و حدود ۳۰ ثانیه دیگر نمایش داده می‌شود." : "ابتدا اجازه اعلان را فعال کنید."; } catch { alarmStatus.textContent = "تنظیم هشدار آزمایشی ناموفق بود."; } });
  $("#today").textContent = new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  render();
})();
