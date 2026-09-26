"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { installAccountAlarmPrivacyGuard, isAccountDeviceAlarmOwner, type PendingDeviceAlarm } from "./device-alarm-scheduler";

export const NATIVE_ALARM_SESSION_KEY = "tia.native-alarm-session.v1";
export type NativeAlarmPrivacyStatus = {
  state: "ready" | "cleaning" | "blocked" | "unsupported";
  canSchedule: boolean;
  message: string;
};
type Receipt = { id: number; owner: string };
type Journal = { version: 1; account: string | null; cleanup: boolean; receipts: Receipt[] };
type Delivered = { id: number; tag?: string | null };
export type NativeAlarmSessionPort = {
  storage: Pick<Storage, "getItem" | "setItem">;
  getPending(): Promise<{ notifications: PendingDeviceAlarm[] }>;
  cancel(options: { notifications: { id: number }[] }): Promise<unknown>;
  getDeliveredNotifications(): Promise<{ notifications: Delivered[] }>;
  removeDeliveredNotifications(options: { notifications: Delivered[] }): Promise<unknown>;
};
const cleaning: NativeAlarmPrivacyStatus = { state: "cleaning", canSchedule: false,
  message: "در حال پاک‌کردن یادآوری‌های حساب قبلی؛ یادآوری تازه فعلاً تنظیم نمی‌شود." };
const blocked: NativeAlarmPrivacyStatus = { state: "blocked", canSchedule: false,
  message: "پاک‌سازی یادآوری‌های حساب قبلی تأیید نشد؛ ممکن است هنوز نمایش داده شوند. دوباره تلاش کن. یادآوری تازه فعلاً تنظیم نمی‌شود." };
const unsupported: NativeAlarmPrivacyStatus = { state: "unsupported", canSchedule: false, message: "" };

/** One controller per WebView. The journal contains ownership receipts, never titles. */
export function createNativeAlarmSession(port: NativeAlarmSessionPort) {
  let journal: Journal = { version: 1, account: null, cleanup: true, receipts: [] };
  let initialized = false, revision = 0;
  let status = cleaning;
  let running: Promise<NativeAlarmPrivacyStatus> | undefined, again = false;
  const listeners = new Set<(status: NativeAlarmPrivacyStatus) => void>();
  const publish = (next: NativeAlarmPrivacyStatus) => {
    status = next;
    for (const listener of listeners) listener(next);
    return next;
  };
  const persist = () => {
    const json = JSON.stringify(journal);
    port.storage.setItem(NATIVE_ALARM_SESSION_KEY, json);
    if (port.storage.getItem(NATIVE_ALARM_SESSION_KEY) !== json) throw new Error("Native cleanup journal not saved");
  };
  const guard = installAccountAlarmPrivacyGuard({
    onIdle() { if (initialized && journal.cleanup) void retry(); },
    onClear() {
      requireCleanup();
      try { persist(); } catch (error) { publish(blocked); throw error; }
      void retry();
    },
  });
  function requireCleanup() {
    guard.fence();
    ++revision;
    journal.cleanup = true;
    publish(cleaning);
  }
  const owned = (rows: PendingDeviceAlarm[]) => rows.filter(row => isAccountDeviceAlarmOwner(row.extra?.owner));
  const remember = (rows: PendingDeviceAlarm[]) => {
    const receipts = new Map(journal.receipts.map(row => [row.id, row]));
    for (const row of owned(rows)) receipts.set(row.id, { id: row.id, owner: String(row.extra!.owner) });
    journal.receipts = [...receipts.values()];
    persist(); // Same durable cancellation intent, before ANY bridge mutation.
  };
  const ownedDelivered = (rows: Delivered[], saved: PendingDeviceAlarm[]) => rows.filter(row => {
    // Android local notifications use notify(id), not a tagged notify(tag,id).
    // getDeliveredNotifications().data is Android extras, NOT our extra.owner.
    // Join against the plugin's persisted source; preserve every other tag/owner.
    if (row.tag != null) return false;
    const source = saved.find(item => item.id === row.id);
    if (source) return isAccountDeviceAlarmOwner(source.extra?.owner);
    return journal.receipts.some(receipt => receipt.id === row.id && isAccountDeviceAlarmOwner(receipt.owner));
  });
  async function clean() {
    const current = revision;
    try {
      persist();
      const pending = (await port.getPending()).notifications;
      remember(pending);
      const targets = owned(pending);
      // Cancel first: Capacitor retains delivered storage until removal. Still
      // attempt removal on an uncertain cancel, but never acknowledge that failure.
      let cancelFailed = false;
      try { if (targets.length) await port.cancel({ notifications: targets.map(({ id }) => ({ id })) }); }
      catch { cancelFailed = true; }
      const visible = (await port.getDeliveredNotifications()).notifications;
      const stored = (await port.getPending()).notifications;
      remember(stored);
      const remove = ownedDelivered(visible, stored);
      if (remove.length) await port.removeDeliveredNotifications({ notifications: remove });
      if (cancelFailed) throw new Error("Native cleanup uncertain");
      const remaining = (await port.getPending()).notifications;
      const delivered = (await port.getDeliveredNotifications()).notifications;
      const live = (await port.getPending()).notifications;
      remember(live);
      if (owned(remaining).length || owned(live).length || ownedDelivered(delivered, live).length) throw new Error("Native cleanup not confirmed");
      // A stale native call can still write AFTER this sweep. Keep the receipt
      // durable and the next account fenced until that call settles and is swept.
      if (guard.busy() || current !== revision) return publish(cleaning);
      const prior = journal;
      journal = { ...journal, cleanup: false, receipts: [] };
      try { persist(); } catch (error) { journal = prior; throw error; }
      if (journal.account !== null) guard.allow();
      return publish({ state: "ready", canSchedule: journal.account !== null, message: "" });
    } catch {
      return publish(blocked);
    }
  }
  function retry(): Promise<NativeAlarmPrivacyStatus> {
    if (running) { again = true; return running; }
    if (!journal.cleanup) return Promise.resolve(status);
    running = clean().finally(() => {
      running = undefined;
      if (again) { again = false; if (journal.cleanup) void retry(); }
    });
    return running;
  }
  function setAccount(account: string | null) {
    if (!initialized) {
      initialized = true;
      try {
        const saved = JSON.parse(port.storage.getItem(NATIVE_ALARM_SESSION_KEY) ?? "null") as Journal | null;
        if (saved?.version === 1 && (saved.account === null || typeof saved.account === "string") &&
            typeof saved.cleanup === "boolean" && Array.isArray(saved.receipts) && saved.receipts.every(row =>
              row && Number.isInteger(row.id) && row.id > 0 && row.id <= 2147483647 && isAccountDeviceAlarmOwner(row.owner))) journal = saved;
      } catch { /* Missing, corrupt or unavailable storage requires a verified sweep. */ }
    }
    const changed = journal.account !== account;
    journal.account = account;
    if (changed || account === null || journal.cleanup) {
      requireCleanup();
      try { persist(); } catch { return Promise.resolve(publish(blocked)); }
      return retry();
    }
    guard.allow();
    return Promise.resolve(publish({ state: "ready", canSchedule: true, message: "" }));
  }
  return {
    setAccount, retry, getStatus: () => status,
    subscribe(listener: (status: NativeAlarmPrivacyStatus) => void) {
      listeners.add(listener); listener(status);
      return () => { listeners.delete(listener); };
    },
  };
}

let controller: ReturnType<typeof createNativeAlarmSession> | undefined;
function nativeSession() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return undefined;
  return controller ??= createNativeAlarmSession({
    storage: { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) },
    getPending: () => LocalNotifications.getPending(),
    cancel: options => LocalNotifications.cancel(options),
    getDeliveredNotifications: () => LocalNotifications.getDeliveredNotifications(),
    removeDeliveredNotifications: options => LocalNotifications.removeDeliveredNotifications({
      notifications: options.notifications.map(({ id, tag }) => ({ id, ...(tag != null ? { tag } : {}), title: "", body: "" })),
    }),
  });
}
/** Also call before signOut; on failed signOut restore the still-current account. */
export function setNativeAlarmAccount(account: string | null): Promise<NativeAlarmPrivacyStatus> {
  return nativeSession()?.setAccount(account) ?? Promise.resolve(unsupported);
}
/** Replace the dashboard's fire-and-forget logout cleanup with this lifecycle. */
export function watchNativeAlarmSession(account: string | null, onStatus: (status: NativeAlarmPrivacyStatus) => void) {
  const session = nativeSession();
  if (!session) { onStatus(unsupported); return { retry: () => Promise.resolve(unsupported), stop() {} }; }
  const unsubscribe = session.subscribe(onStatus);
  void session.setAccount(account);
  const retry = () => account === null ? session.setAccount(null) : session.retry();
  const visible = () => { if (document.visibilityState === "visible") void retry(); };
  const focus = () => { void retry(); };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("focus", focus);
  let stopped = false;
  return {
    retry,
    stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", focus);
      // Fence synchronously on unmount/account switch; keep retry intent durable.
      void session.setAccount(null);
    },
  };
}
