(() => {
  "use strict";
  const reminderOptions = [1440, 180, 60];
  function normalizeOffsets(value) {
    const selected = Array.isArray(value) ? reminderOptions.filter((offset) => value.includes(offset)) : [];
    return selected.length ? selected : [...reminderOptions];
  }
  function localDateInput(value) {
    const date = new Date(value);
    const part = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
  }
  function dailyPoem(selections, value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const part = (type) => Number(parts.find((item) => item.type === type).value);
    const day = Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / 86400000);
    const elapsed = day - Math.floor(Date.UTC(2026, 0, 1) / 86400000);
    return selections[((elapsed % selections.length) + selections.length) % selections.length];
  }
  function reminderTimes(task, now = Date.now()) {
    if (task.done || !task.deadline) return [];
    const deadline = new Date(task.deadline).getTime();
    if (!Number.isFinite(deadline)) return [];
    return normalizeOffsets(task.reminderOffsets).map((offset) => deadline - offset * 60000).filter((time) => time > now);
  }
  function notificationIds(task) {
    return [...new Set([...(task.notificationIds || []), task.notificationId].filter((id) => Number.isInteger(id) && id > 0))];
  }
  function persianMonth(value = new Date()) {
    const format = new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", month: "numeric", day: "numeric" });
    const part = (date, name) => Number(format.formatToParts(date).find((item) => item.type === name).value);
    const month = part(value, "month");
    const first = new Date(value.getFullYear(), value.getMonth(), value.getDate() - part(value, "day") + 1, 12);
    const days = [];
    for (let index = 0; index < 31; index += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index, 12);
      if (part(date, "month") !== month) break;
      days.push({ day: index + 1, date });
    }
    return { first, days };
  }
  window.HamrahOffline = { normalizeOffsets, localDateInput, dailyPoem, reminderTimes, notificationIds, persianMonth };
})();
