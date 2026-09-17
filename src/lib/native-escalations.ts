"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { nativeNotificationId } from "@/lib/escalations";
import { LEGACY_ALARM_SOUND_HELP, prepareDeviceAlarmChannel } from "./alarm-sounds";
import { nativeAlarmSoundPlugin } from "./native-alarm-sounds";
import { createDeviceAlarmScheduler } from "./device-alarm-scheduler";

export type NativeEscalationAlarm = {
  id: string;
  taskId: string;
  title: string;
  scheduledFor: string;
  attemptNumber: number;
  level: "ANDROID_ALARM";
};

const channelId = "urgent-overdue";
const owner = "hamrah-urgent-escalation";

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function ensureUrgentChannel() {
  return prepareDeviceAlarmChannel(nativeAlarmSoundPlugin(), () => LocalNotifications.createChannel({
    id: channelId,
    name: "کارهای فوری عقب‌افتاده",
    description: "هشدارهای تکرارشونده برای کار فوری که از موعدش گذشته است",
    sound: "urgent_alarm.wav",
    importance: 5,
    visibility: 1,
    lights: true,
    lightColor: "#C56E74",
    vibration: true,
  }), channelId);
}

const scheduler = createDeviceAlarmScheduler({
  owner,
  getPending: () => LocalNotifications.getPending(),
  cancel: options => LocalNotifications.cancel(options),
  schedule: options => LocalNotifications.schedule(options),
  checkPermissions: () => LocalNotifications.checkPermissions(),
  prepareAlarm: ensureUrgentChannel,
  prepareNotification: async () => { throw new Error("Escalations must use ALARM"); },
});

export async function enableNativeEscalationAlarms() {
  if (!isNativeAndroid()) return { enabled: false, message: "Alarm بومی فقط داخل اپ اندروید فعال می‌شود." };
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") return { enabled: false, message: "اجازه اعلان اندروید داده نشد." };

  const exact = await LocalNotifications.checkExactNotificationSetting();
  if (exact.exact_alarm !== "granted") await LocalNotifications.changeExactNotificationSetting();
  const sound = await ensureUrgentChannel();
  const finalExact = await LocalNotifications.checkExactNotificationSetting();
  return {
    enabled: true,
    exact: finalExact.exact_alarm === "granted",
    message: (finalExact.exact_alarm === "granted" ? "Alarm دقیق اندروید فعال شد." : "اعلان فعال شد؛ زمان Alarm ممکن است کمی جابه‌جا شود.") +
      (sound.legacySound ? ` ${LEGACY_ALARM_SOUND_HELP}` : ""),
  };
}

export async function syncNativeEscalationAlarms(alarms: NativeEscalationAlarm[]) {
  if (!isNativeAndroid()) return { scheduled: 0, acceptedIds: [] as string[], native: false };
  // A revoked original ID must not inherit another alarm's numeric receipt.
  const originals = new Map<number, string>();
  for (const alarm of alarms) {
    const id = nativeNotificationId(alarm.id), previous = originals.get(id);
    if (previous !== undefined && previous !== alarm.id) throw new Error("Conflicting native alarm identities");
    originals.set(id, alarm.id);
  }
  // Snapshot before queueing. Stable attempt IDs retain existing times and sounds.
  const notifications = alarms.map((alarm) => ({
    id: nativeNotificationId(alarm.id),
    at: Date.parse(alarm.scheduledFor),
    alarm: true,
    title: "کار فوری عقب‌افتاده",
    body: alarm.title,
    largeBody: `زمان انجام «${alarm.title}» گذشته است. پس از انجام، وضعیت کار را در همراه به پایان‌یافته تغییر بده.`,
    summaryText: `هشدار ${alarm.attemptNumber}`,
    group: "hamrah-urgent-tasks",
    iconColor: "#5C70B4",
    extra: { owner, attemptId: alarm.id, taskId: alarm.taskId },
  }));

  const result = await scheduler.sync(async () => notifications);
  const accepted = new Set(result.acceptedIds);
  return { ...result, acceptedIds: [...new Set(alarms.filter(alarm => accepted.has(nativeNotificationId(alarm.id))).map(alarm => alarm.id))], native: true };
}

export async function clearNativeEscalationAlarms() {
  if (!isNativeAndroid()) return;
  await scheduler.clear();
}
export async function cancelNativeEscalationAlarms(ids: string[]) {
  if (isNativeAndroid()) await scheduler.cancelIds(ids.map(id => ({ id: nativeNotificationId(id), extra: { attemptId: id } })));
}
