"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { nativeNotificationId } from "@/lib/escalations";

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
  await LocalNotifications.createChannel({
    id: channelId,
    name: "کارهای فوری عقب‌افتاده",
    description: "هشدارهای تکرارشونده برای کار فوری که از موعدش گذشته است",
    sound: "urgent_alarm.wav",
    importance: 5,
    visibility: 1,
    lights: true,
    lightColor: "#C56E74",
    vibration: true,
  });
}

export async function enableNativeEscalationAlarms() {
  if (!isNativeAndroid()) return { enabled: false, message: "Alarm بومی فقط داخل اپ اندروید فعال می‌شود." };
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") permission = await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") return { enabled: false, message: "اجازه اعلان اندروید داده نشد." };

  const exact = await LocalNotifications.checkExactNotificationSetting();
  if (exact.exact_alarm !== "granted") await LocalNotifications.changeExactNotificationSetting();
  await ensureUrgentChannel();
  const finalExact = await LocalNotifications.checkExactNotificationSetting();
  return {
    enabled: true,
    exact: finalExact.exact_alarm === "granted",
    message: finalExact.exact_alarm === "granted" ? "Alarm دقیق اندروید فعال شد." : "اعلان فعال شد؛ زمان Alarm ممکن است کمی جابه‌جا شود.",
  };
}

export async function syncNativeEscalationAlarms(alarms: NativeEscalationAlarm[]) {
  if (!isNativeAndroid()) return { scheduled: 0, native: false };
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return { scheduled: 0, native: true, permissionRequired: true };
  await ensureUrgentChannel();

  const pending = await LocalNotifications.getPending();
  const existing = pending.notifications.filter((notification) => notification.extra?.owner === owner);
  if (existing.length) await LocalNotifications.cancel({ notifications: existing.map(({ id }) => ({ id })) });

  const now = Date.now();
  const notifications = alarms.map((alarm) => ({
    id: nativeNotificationId(alarm.id),
    title: "کار فوری عقب‌افتاده",
    body: alarm.title,
    largeBody: `زمان انجام «${alarm.title}» گذشته است. پس از انجام، وضعیت کار را در همراه به پایان‌یافته تغییر بده.`,
    summaryText: `هشدار ${alarm.attemptNumber}`,
    channelId,
    sound: "urgent_alarm.wav",
    smallIcon: "ic_stat_hamrah",
    iconColor: "#657966",
    group: "hamrah-urgent-tasks",
    autoCancel: true,
    schedule: {
      at: new Date(Math.max(now + 1_500, new Date(alarm.scheduledFor).getTime())),
      allowWhileIdle: true,
    },
    extra: { owner, attemptId: alarm.id, taskId: alarm.taskId },
  }));

  if (notifications.length) await LocalNotifications.schedule({ notifications });
  return { scheduled: notifications.length, native: true };
}

export async function clearNativeEscalationAlarms() {
  if (!isNativeAndroid()) return;
  const pending = await LocalNotifications.getPending();
  const existing = pending.notifications.filter((notification) => notification.extra?.owner === owner);
  if (existing.length) await LocalNotifications.cancel({ notifications: existing.map(({ id }) => ({ id })) });
}
