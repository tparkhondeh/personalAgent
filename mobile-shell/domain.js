(() => {
  "use strict";
  const reminderOptions = [1440, 180, 60];
  const repeatSettingsKey = "hamrah-local-urgent-repeats-v1";
  const repeatSettingsDefaults = Object.freeze({ repeatCount: 3, repeatMinutes: 15 });
  function validRepeatSettings(value) {
    return value && Number.isInteger(value.repeatCount) && value.repeatCount >= 0 && value.repeatCount <= 6
      && Number.isInteger(value.repeatMinutes) && value.repeatMinutes >= 10 && value.repeatMinutes <= 1440;
  }
  function copyRepeatSettings(value) { return { repeatCount: value.repeatCount, repeatMinutes: value.repeatMinutes }; }
  function createRepeatSettingsStore(storage) {
    let raw, readable = false;
    return {
      load() {
        try {
          raw = storage.getItem(repeatSettingsKey);
          const value = raw === null ? null : JSON.parse(raw);
          if (raw !== null && !validRepeatSettings(value)) throw new Error("invalid settings");
          readable = true;
          return { ok: true, value: value === null ? null : copyRepeatSettings(value) };
        } catch { readable = false; return { ok: false, value: null }; }
      },
      save(value) {
        if (!readable || !validRepeatSettings(value)) return { ok: false };
        try {
          if (storage.getItem(repeatSettingsKey) !== raw) { readable = false; return { ok: false }; }
          const serialized = JSON.stringify(copyRepeatSettings(value));
          storage.setItem(repeatSettingsKey, serialized);
          if (storage.getItem(repeatSettingsKey) !== serialized) { readable = false; return { ok: false }; }
          raw = serialized;
          return { ok: true, value: copyRepeatSettings(value) };
        } catch { return { ok: false }; }
      },
    };
  }
  function manualRepeatPolicy(task, settings) {
    const value = task ? task.urgentRepeatPolicy : settings;
    return validRepeatSettings(value) ? copyRepeatSettings(value) : undefined;
  }
  function repeatSummary(policy) {
    if (!policy) return "فقط یادآوری‌های انتخاب‌شده؛ هشدار جداگانه در موعد و پیگیری پس از آن تنظیم نمی‌شود.";
    const fa = value => Number(value).toLocaleString("fa-IR");
    return policy.repeatCount === 0 ? "هشدار اولیه در موعد؛ بدون تکرار اضافه"
      : `هشدار در موعد و ${fa(policy.repeatCount)} تکرار اضافه با فاصله ${fa(policy.repeatMinutes)} دقیقه`;
  }
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
    if (task.done || task.archived || !task.deadline) return [];
    const deadline = new Date(task.deadline).getTime();
    if (!Number.isFinite(deadline)) return [];
    const times = normalizeOffsets(task.reminderOffsets).map((offset) => deadline - offset * 60000);
    const policy = manualRepeatPolicy(task);
    if (task.priority === "urgent" && policy) {
      for (let n = 0; n <= policy.repeatCount; n++) times.push(deadline + n * policy.repeatMinutes * 60000);
    }
    return [...new Set(times)].filter(time => time > now);
  }
  function notificationTimes(task, planner, now = Date.now()) {
    if (!task.approvedPlan) return reminderTimes(task, now);
    const plan = task.approvedPlan, deadline = Date.parse(task.deadline);
    if (task.done || task.archived || !Number.isFinite(deadline) || !plan.channels.some(c => c === "ALARM" || c === "NATIVE")) return [];
    const escalation = plan.escalation && task.priority === "urgent" && plan.channels.includes("ALARM");
    const zero = escalation && plan.repeatCount === 0;
    const single = { ...plan, operation: "CREATE", recurrence: "NONE", occurrenceCount: null };
    const times = planner.plannedReminderTimes({ ...single,
      reminderOffsets: zero ? plan.reminderOffsets.filter(offset => offset !== 0) : plan.reminderOffsets,
      ...planner.dateParts(new Date(deadline), plan.timezone),
    }, new Date(now)).map(r => Date.parse(r.scheduledFor)).filter(time => !zero || time <= deadline);
    if (zero && deadline > now) times.push(deadline);
    else if (escalation && plan.repeatCount > 0) {
      for (let n = 1; n <= plan.repeatCount; n++) {
        const base = new Date(deadline + n * plan.repeatMinutes * 60000);
        const extra = planner.plannedReminderTimes({ ...single, reminderOffsets: [0], ...planner.dateParts(base, plan.timezone) }, new Date(now));
        if (extra[0]) times.push(Date.parse(extra[0].scheduledFor));
      }
    }
    return [...new Set(times)].filter(time => time > now);
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
  window.HamrahOffline = { normalizeOffsets, localDateInput, dailyPoem, reminderTimes, notificationIds, persianMonth,
    repeatSettingsDefaults, createRepeatSettingsStore, manualRepeatPolicy, repeatSummary, notificationTimes };
})();
