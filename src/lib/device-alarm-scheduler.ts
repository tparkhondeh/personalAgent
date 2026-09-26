// Import-free scheduler shared with the bundled app. One instance per owner.
export type DeviceAlarmRequest = {
  id: number;
  at: number;
  alarm: boolean;
  title: string;
  body: string;
  extra?: Record<string, unknown>;
  largeBody?: string;
  summaryText?: string;
  group?: string;
  iconColor?: string;
};
export type PendingDeviceAlarm = { id: number; extra?: Record<string, unknown> };
export type DeviceAlarmCancellation = { id: number; extra?: Record<string, string> };
export type ScheduledDeviceAlarm = Omit<DeviceAlarmRequest, "at" | "alarm"> & {
  channelId: string; sound?: string; smallIcon: string; autoCancel: boolean;
  schedule: { at: Date; allowWhileIdle: boolean };
};
export type DeviceAlarmSchedulerPort = {
  owner: string;
  getPending(): Promise<{ notifications: PendingDeviceAlarm[] }>;
  cancel(options: { notifications: { id: number }[] }): Promise<unknown>;
  schedule(options: { notifications: ScheduledDeviceAlarm[] }): Promise<unknown>;
  checkPermissions(): Promise<{ display: string }>;
  prepareAlarm(): Promise<{ channelId: string; sound: string; legacySound: boolean }>;
  prepareNotification(): Promise<string>;
  now?: () => number;
};

// Account cleanup is deliberately separate from the bundled hamrah-local owner.
// No imports: the same scheduler is embedded in the offline document generator.
export const ACCOUNT_DEVICE_ALARM_OWNERS = ["hamrah-approved-reminders", "hamrah-urgent-escalation"] as const;
export function isAccountDeviceAlarmOwner(owner: unknown): boolean {
  return ACCOUNT_DEVICE_ALARM_OWNERS.some(value => value === owner);
}
let accountEpoch = 0, accountBlocked = false, accountWrites = 0;
let accountPrivacy: { onIdle(): void; onClear(): void } | undefined;
export function installAccountAlarmPrivacyGuard(callbacks: { onIdle(): void; onClear(): void }) {
  accountPrivacy = callbacks;
  accountBlocked = true;
  ++accountEpoch;
  return {
    fence() { accountBlocked = true; ++accountEpoch; },
    allow() { accountBlocked = false; },
    busy: () => accountWrites > 0,
  };
}

export function createDeviceAlarmScheduler(port: DeviceAlarmSchedulerPort) {
  let generation = 0;
  const accountOwned = isAccountDeviceAlarmOwner(port.owner);
  const revoked: DeviceAlarmCancellation[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const now = port.now ?? Date.now;
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const next = queue.then(action);
    queue = next.catch(() => {});
    return next;
  };
  const matches = (item: PendingDeviceAlarm, receipt: DeviceAlarmCancellation) => item.id === receipt.id &&
    Object.entries(receipt.extra ?? {}).every(([key, value]) => item.extra?.[key] === value);
  const isRevoked = (item: PendingDeviceAlarm) => revoked.some(receipt => matches(item, receipt));
  const nativeWrite = async <T>(write: () => Promise<T>): Promise<T> => {
    if (accountOwned) ++accountWrites;
    try { return await write(); }
    finally {
      if (accountOwned && --accountWrites === 0) accountPrivacy?.onIdle();
    }
  };
  const cancelOwned = (receipts?: DeviceAlarmCancellation[]) => nativeWrite(async () => {
    const pending = await port.getPending();
    const owned = pending.notifications.filter(item => item.extra?.owner === port.owner && (!receipts || receipts.some(receipt => matches(item, receipt))));
    if (owned.length) await port.cancel({ notifications: owned.map(({ id }) => ({ id })) });
  });
  return {
    sync(load: () => Promise<DeviceAlarmRequest[]>, options: { cancelObsolete?: boolean } = {}) {
      const current = generation;
      const sessionEpoch = accountEpoch, blockedAtStart = accountOwned && accountBlocked;
      const stale = () => current !== generation || (accountOwned && (blockedAtStart || accountBlocked || sessionEpoch !== accountEpoch));
      return enqueue(async () => {
        const result = { scheduled: 0, retained: 0, acceptedIds: [] as number[], permissionRequired: false, legacySound: false };
        const invalidated = () => ({ ...result, retained: 0, acceptedIds: [] as number[] });
        if (stale()) return invalidated();
        const requests = await load();
        if (stale()) return invalidated();
        const unique = new Map<number, DeviceAlarmRequest>();
        for (const request of requests) {
          if (isRevoked(request)) continue;
          if (!Number.isInteger(request.id) || request.id < 1 || request.id > 2147483647 || !Number.isFinite(request.at)) {
            throw new Error("Invalid device reminder");
          }
          const duplicate = unique.get(request.id);
          if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(request)) throw new Error("Conflicting device reminder IDs");
          unique.set(request.id, request);
        }
        const pending = (await port.getPending()).notifications;
        if (stale()) return invalidated();
        for (const item of pending) {
          if (unique.has(item.id) && item.extra?.owner !== port.owner) throw new Error("Device reminder ID belongs to another owner");
          const requested = unique.get(item.id);
          for (const key of ["attemptId", "reminderId", "taskId"]) {
            if (requested?.extra?.[key] !== undefined && item.extra?.[key] !== undefined && requested.extra[key] !== item.extra[key]) {
              throw new Error("Device reminder ID collision");
            }
          }
        }
        const owned = pending.filter(item => item.extra?.owner === port.owner);
        const obsolete = owned.filter(item => !unique.has(item.id));
        if (options.cancelObsolete !== false && obsolete.length) await nativeWrite(() => port.cancel({ notifications: obsolete.map(({ id }) => ({ id })) }));
        if (stale()) return invalidated();
        const existing = new Set(owned.map(item => item.id));
        result.acceptedIds = [...unique.keys()].filter(id => existing.has(id));
        result.retained = result.acceptedIds.length;
        const retainedResult = () => {
          const acceptedIds = result.acceptedIds.filter(id => !isRevoked(unique.get(id)!));
          return { ...result, acceptedIds, retained: acceptedIds.length };
        };
        const missing = [...unique.values()].filter(item => !existing.has(item.id) && item.at > now());
        // No channel/permission/settings work for retained or expired schedules.
        if (!missing.length) return retainedResult();
        const permissions = await port.checkPermissions();
        if (stale()) return invalidated();
        if (permissions.display !== "granted") return { ...retainedResult(), permissionRequired: true };
        const alarm = missing.some(item => item.alarm) ? await port.prepareAlarm() : undefined;
        if (stale()) return invalidated();
        const notification = missing.some(item => !item.alarm) ? await port.prepareNotification() : undefined;
        if (stale()) return invalidated();
        const notifications = missing.filter(item => item.at > now() && !isRevoked(item)).map(({ at, alarm: isAlarm, extra, ...item }) => ({
          ...item, channelId: isAlarm ? alarm!.channelId : notification!,
          ...(isAlarm ? { sound: alarm!.sound } : {}),
          smallIcon: "ic_stat_hamrah", autoCancel: true,
          schedule: { at: new Date(at), allowWhileIdle: isAlarm },
          extra: { ...extra, owner: port.owner },
        }));
        // Capacitor uses stable numeric IDs. On a partial/ambiguous failure, the next
        // serialized retry reads pending IDs and only schedules the missing future ones.
        await nativeWrite(async () => { try {
          if (notifications.length) await port.schedule({ notifications });
        } finally {
          // clear() must not await a stalled fetch/native call. Remove any late or
          // partially accepted native writes when that old call finally settles.
          const late = notifications.filter(item => stale() || isRevoked(item));
          if (late.length) {
            await port.cancel({ notifications: late.map(({ id }) => ({ id })) });
          }
        } });
        if (stale()) return invalidated();
        const retained = retainedResult();
        const accepted = notifications.filter(item => !isRevoked(item));
        return { ...retained, scheduled: accepted.length,
          acceptedIds: [...retained.acceptedIds, ...accepted.map(item => item.id)], legacySound: alarm?.legacySound ?? false };
      });
    },
    cancelIds(ids: (number | DeviceAlarmCancellation)[]) {
      const receipts = ids.map(id => typeof id === "number" ? { id } : id);
      if (receipts.some(row => !Number.isInteger(row.id) || row.id < 1 || row.id > 2147483647)) return Promise.reject(new Error("Invalid cancellation IDs"));
      if (!receipts.length) return Promise.resolve();
      // A scoped tombstone cancels late writes without deleting another task's
      // newly scheduled alarm. Match original IDs too when numeric hashes collide.
      revoked.push(...receipts);
      const canceled = cancelOwned(receipts);
      queue = Promise.allSettled([queue, canceled]).then(() => {});
      return canceled;
    },
    clear() {
      ++generation;
      // The session helper journals a two-owner cancellation intent synchronously
      // before legacy clear callers can reach the bridge. A failed journal is closed.
      try { if (accountOwned) accountPrivacy?.onClear(); }
      catch (error) { return Promise.reject(error); }
      // Cancellation starts immediately, not behind a network request. Future
      // syncs still wait for both the old operation and this cancellation barrier.
      const canceled = cancelOwned();
      queue = Promise.allSettled([queue, canceled]).then(() => {});
      return canceled;
    },
  };
}
