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
        || task.alarmCancellations !== undefined && (!Array.isArray(task.alarmCancellations) || !task.alarmCancellations.every(receipt => record(receipt) && ids([receipt.id]) && receipt.taskId === task.id))
        || task.approvalReceipt !== undefined && (!record(task.approvalReceipt) || typeof task.approvalReceipt.id !== "string" || !task.approvalReceipt.id || !Number.isSafeInteger(task.approvalReceipt.revision) || task.approvalReceipt.revision < 1)
        || task.reminderOffsets !== undefined && (!Array.isArray(task.reminderOffsets) || !task.reminderOffsets.every(v => Number.isSafeInteger(v) && v >= 0))
        || task.approvedPlan !== undefined && (!record(task.approvedPlan) || !Array.isArray(task.approvedPlan.channels) || !task.approvedPlan.channels.every(c => typeof c === "string"))) return false;
      seen.add(task.id);
      return true;
    });
  }
  // One receiver per WebMessage object, including multiple store instances.
  const clients = new WeakMap();
  function nativeClient(bridge, timeoutMs) {
    if (!bridge || typeof bridge.postMessage !== "function") return null;
    if (clients.has(bridge)) return clients.get(bridge);
    const session = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let sequence = 0, rejected = null;
    const pending = new Map();
    bridge.onmessage = event => {
      let reply;
      try { reply = JSON.parse(event.data); } catch { return; }
      if (!record(reply)) return;
      if (reply.id === null && reply.ok === false && ["BUSY", "INVALID"].includes(reply.error)) {
        rejected = reply.error;
        for (const finish of [...pending.values()]) finish({ ok: false, error: rejected });
        return;
      }
      if (typeof reply.id !== "string") return;
      const finish = pending.get(reply.id);
      if (finish) finish(reply);
    };
    const request = message => new Promise(resolve => {
      if (rejected) { resolve({ ok: false, error: rejected }); return; }
      if (pending.size >= 16) { resolve({ ok: false, error: "BUSY" }); return; }
      const id = `${session}-${++sequence}`;
      const timer = setTimeout(() => finish({ ok: false, error: "TIMEOUT" }), timeoutMs);
      const finish = reply => { clearTimeout(timer); pending.delete(id); resolve(reply); };
      pending.set(id, finish);
      try { bridge.postMessage(JSON.stringify({ ...message, id })); }
      catch { finish({ ok: false, error: "TRANSPORT" }); }
    });
    clients.set(bridge, request);
    return request;
  }
  function createNativeTaskStore(storage, bridge, timeoutMs) {
    const request = nativeClient(bridge, timeoutMs);
    let expected = null, revision = 0, ready = false, pending = false, blocked = false;
    const snapshot = () => expected === null ? [] : JSON.parse(expected);
    const failure = reason => { ready = false; blocked = true; return { ok: false, reason }; };
    function validReply(reply) {
      if (!reply || reply.ok !== true || !Number.isSafeInteger(reply.revision)) return false;
      if (reply.revision === 0) return reply.raw === null;
      if (reply.revision < 1 || typeof reply.raw !== "string") return false;
      try { return validTasks(JSON.parse(reply.raw)); } catch { return false; }
    }
    function accept(reply) {
      expected = reply.raw; revision = reply.revision;
      // Legacy is only a read mirror. Its failure must not undo a durable commit,
      // and its contents are never a fallback after native initialization.
      if (expected !== null) { try { storage.setItem(key, expected); } catch { /* retained native authority */ } }
      ready = true;
      return { ok: true, tasks: snapshot() };
    }
    async function commit(expectedRevision, nextRaw) {
      let reply = await request({ op: "cas", expectedRevision, nextRaw });
      if (reply.ok === false && ["TIMEOUT", "TRANSPORT"].includes(reply.error)) {
        // Never retry the write or allocate another task ID after an unknown reply.
        // A poisoned native process must reject this read too.
        reply = await request({ op: "read" });
      }
      if (!validReply(reply) || reply.revision !== expectedRevision + 1 || reply.raw !== nextRaw) {
        return failure(reply.error === "CONFLICT" ? "changed" : "unconfirmed");
      }
      return accept(reply);
    }
    async function load() {
      if (blocked || pending || !request) return failure("unreadable");
      ready = false; pending = true;
      try {
        const reply = await request({ op: "read" });
        if (!validReply(reply)) return failure("unreadable");
        if (reply.raw !== null) return accept(reply);
        // Only the explicit native absent envelope permits legacy migration.
        const raw = storage.getItem(key);
        if (raw === null) return accept(reply);
        if (!validTasks(JSON.parse(raw))) return failure("invalid");
        return await commit(0, raw);
      } catch { return failure("unreadable"); }
      finally { pending = false; }
    }
    function save(tasks) {
      if (!ready || blocked) return Promise.resolve({ ok: false, reason: "unreadable" });
      if (pending) return Promise.resolve({ ok: false, reason: "busy" });
      let raw;
      try {
        if (!validTasks(tasks)) return Promise.resolve({ ok: false, reason: "invalid" });
        raw = JSON.stringify(tasks);
        if (!validTasks(JSON.parse(raw))) return Promise.resolve({ ok: false, reason: "invalid" });
      } catch { return Promise.resolve({ ok: false, reason: "invalid" }); }
      if (revision >= Number.MAX_SAFE_INTEGER) return Promise.resolve(failure("unwritable"));
      // Freeze the candidate bytes AND its revision before any asynchronous work.
      const expectedRevision = revision;
      pending = true;
      return commit(expectedRevision, raw).catch(() => failure("unconfirmed")).finally(() => { pending = false; });
    }
    return { load, save, snapshot, writable: () => ready && !blocked };
  }
  function createTaskStore(storage, options = {}) {
    const bridge = options.bridge === undefined ? window.TiaTaskStoreNative : options.bridge;
    const nativeRequired = options.nativeRequired ?? Boolean(bridge || window.HamrahAppearanceNative ||
      window.Capacitor?.getPlatform?.() === "android" || window.location?.origin === "https://localhost");
    if (nativeRequired) return createNativeTaskStore(storage, bridge, options.timeoutMs ?? 10000);
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
    return { load, save, snapshot, writable: () => ready };
  }
  window.HamrahStorage = { createTaskStore, validTasks };
})();
