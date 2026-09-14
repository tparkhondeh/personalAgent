// Local tasks only. Never read account cookies, credentials or unrelated storage.
(() => {
  "use strict";
  const key = "hamrah-local-v2";
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const date = value => value == null || typeof value === "string" && Number.isFinite(Date.parse(value));
  const ids = value => value === undefined || Array.isArray(value) && value.every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647);
  function validTasks(value) {
    if (!Array.isArray(value)) return false;
    const seen = new Set();
    return value.every(task => {
      if (!record(task) || typeof task.id !== "string" || !task.id || seen.has(task.id)
        || typeof task.title !== "string" || !task.title.trim() || typeof task.done !== "boolean"
        || !["personal", "company", "meeting"].includes(task.category)
        || !["normal", "important", "urgent"].includes(task.priority)
        || ![task.deadline, task.endsAt, task.updatedAt].every(date)
        || task.archived !== undefined && typeof task.archived !== "boolean"
        || !ids(task.notificationIds)
        || task.notificationId !== undefined && !ids([task.notificationId])
        || task.reminderOffsets !== undefined && (!Array.isArray(task.reminderOffsets) || !task.reminderOffsets.every(v => Number.isSafeInteger(v) && v >= 0))
        || task.approvedPlan !== undefined && (!record(task.approvedPlan) || !Array.isArray(task.approvedPlan.channels) || !task.approvedPlan.channels.every(c => typeof c === "string"))) return false;
      seen.add(task.id);
      return true;
    });
  }
  function createTaskStore(storage) {
    let expected = null, ready = false;
    const snapshot = () => expected === null ? [] : JSON.parse(expected);
    function load() {
      ready = false;
      try {
        const raw = storage.getItem(key);
        const tasks = raw === null ? [] : JSON.parse(raw);
        if (!validTasks(tasks)) return { ok: false, reason: "invalid", tasks: [] };
        expected = raw;
        ready = true;
        return { ok: true, tasks };
      } catch { return { ok: false, reason: "unreadable", tasks: [] }; }
    }
    function save(tasks) {
      if (!ready) return { ok: false, reason: "unreadable" };
      try {
        // Compare exact bytes: another window/async operation must not lose a newer write.
        if (storage.getItem(key) !== expected) { ready = false; return { ok: false, reason: "changed" }; }
        if (!validTasks(tasks)) return { ok: false, reason: "invalid" };
        const serialized = JSON.stringify(tasks);
        if (!validTasks(JSON.parse(serialized))) return { ok: false, reason: "invalid" };
        storage.setItem(key, serialized);
        expected = serialized;
        return { ok: true };
      } catch { return { ok: false, reason: "unwritable" }; }
    }
    return { load, save, snapshot };
  }
  window.HamrahStorage = { createTaskStore, validTasks };
})();
