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
export function createDeviceAlarmScheduler(port: DeviceAlarmSchedulerPort) {
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const now = port.now ?? Date.now;
  const enqueue = <T>(action: () => Promise<T>): Promise<T> => {
    const next = queue.then(action);
    queue = next.catch(() => {});
    return next;
  };
  const cancelOwned = async () => {
    const pending = await port.getPending();
    const owned = pending.notifications.filter(item => item.extra?.owner === port.owner);
    if (owned.length) await port.cancel({ notifications: owned.map(({ id }) => ({ id })) });
  };
  return {
    sync(load: () => Promise<DeviceAlarmRequest[]>, options: { cancelObsolete?: boolean } = {}) {
      const current = generation;
      return enqueue(async () => {
        const result = { scheduled: 0, retained: 0, acceptedIds: [] as number[], permissionRequired: false, legacySound: false };
        const invalidated = () => ({ ...result, retained: 0, acceptedIds: [] as number[] });
        if (current !== generation) return invalidated();
        const requests = await load();
        if (current !== generation) return invalidated();
        const unique = new Map<number, DeviceAlarmRequest>();
        for (const request of requests) {
          if (!Number.isInteger(request.id) || request.id < 1 || request.id > 2147483647 || !Number.isFinite(request.at)) {
            throw new Error("Invalid device reminder");
          }
          const duplicate = unique.get(request.id);
          if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(request)) throw new Error("Conflicting device reminder IDs");
          unique.set(request.id, request);
        }
        const pending = (await port.getPending()).notifications;
        if (current !== generation) return invalidated();
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
        if (options.cancelObsolete !== false && obsolete.length) await port.cancel({ notifications: obsolete.map(({ id }) => ({ id })) });
        if (current !== generation) return invalidated();
        const existing = new Set(owned.map(item => item.id));
        result.acceptedIds = [...unique.keys()].filter(id => existing.has(id));
        result.retained = result.acceptedIds.length;
        const missing = [...unique.values()].filter(item => !existing.has(item.id) && item.at > now());
        // No channel/permission/settings work for retained or expired schedules.
        if (!missing.length) return result;
        const permissions = await port.checkPermissions();
        if (current !== generation) return invalidated();
        if (permissions.display !== "granted") return { ...result, permissionRequired: true };
        const alarm = missing.some(item => item.alarm) ? await port.prepareAlarm() : undefined;
        if (current !== generation) return invalidated();
        const notification = missing.some(item => !item.alarm) ? await port.prepareNotification() : undefined;
        if (current !== generation) return invalidated();
        const notifications = missing.filter(item => item.at > now()).map(({ at, alarm: isAlarm, extra, ...item }) => ({
          ...item, channelId: isAlarm ? alarm!.channelId : notification!,
          ...(isAlarm ? { sound: alarm!.sound } : {}),
          smallIcon: "ic_stat_hamrah", autoCancel: true,
          schedule: { at: new Date(at), allowWhileIdle: isAlarm },
          extra: { ...extra, owner: port.owner },
        }));
        // Capacitor uses stable numeric IDs. On a partial/ambiguous failure, the next
        // serialized retry reads pending IDs and only schedules the missing future ones.
        try {
          if (notifications.length) await port.schedule({ notifications });
        } finally {
          // clear() must not await a stalled fetch/native call. Remove any late or
          // partially accepted native writes when that old call finally settles.
          if (current !== generation && notifications.length) {
            await port.cancel({ notifications: notifications.map(({ id }) => ({ id })) });
          }
        }
        if (current !== generation) return invalidated();
        return { ...result, scheduled: notifications.length,
          acceptedIds: [...result.acceptedIds, ...notifications.map(item => item.id)], legacySound: alarm?.legacySound ?? false };
      });
    },
    clear() {
      ++generation;
      // Cancellation starts immediately, not behind a network request. Future
      // syncs still wait for both the old operation and this cancellation barrier.
      const canceled = cancelOwned();
      queue = Promise.allSettled([queue, canceled]).then(() => {});
      return canceled;
    },
  };
}
