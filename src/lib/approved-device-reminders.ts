"use client";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeAndroid } from "@/lib/native-escalations";
import { nativeNotificationId } from "@/lib/escalations";
import { LEGACY_ALARM_SOUND_HELP, prepareDeviceAlarmChannel } from "./alarm-sounds";
import { nativeAlarmSoundPlugin } from "./native-alarm-sounds";
import { createDeviceAlarmScheduler } from "./device-alarm-scheduler";
const owner="hamrah-approved-reminders";
const scheduler = createDeviceAlarmScheduler({
  owner,
  getPending: () => LocalNotifications.getPending(),
  cancel: options => LocalNotifications.cancel(options),
  schedule: options => LocalNotifications.schedule(options),
  checkPermissions: () => LocalNotifications.checkPermissions(),
  prepareAlarm: () => prepareDeviceAlarmChannel(nativeAlarmSoundPlugin(), () => LocalNotifications.createChannel({
    id: "approved-reminders", name: "یادآوری‌های تأییدشده", importance: 5, sound: "urgent_alarm.wav", vibration: true,
  }), "approved-reminders"),
  prepareNotification: async () => {
    await LocalNotifications.createChannel({ id: "approved-notifications", name: "اعلان برنامه", importance: 3, vibration: true });
    return "approved-notifications";
  },
});
export async function clearApprovedDeviceReminders() {
  if (isNativeAndroid()) await scheduler.clear();
  return "";
}
type ApprovedReminder = { id: string; title: string; scheduledFor: string; channel: "ALARM" | "NATIVE" };
function validReminder(value: unknown): value is ApprovedReminder {
  if (!value || typeof value !== "object") return false;
  const row = value as ApprovedReminder;
  return typeof row.id === "string" && row.id.length > 0 && typeof row.title === "string" &&
    typeof row.scheduledFor === "string" && Number.isFinite(Date.parse(row.scheduledFor)) &&
    (row.channel === "ALARM" || row.channel === "NATIVE");
}
export async function syncApprovedDeviceReminders() {
  if(!isNativeAndroid())return "Notification و Alarm فقط داخل اپ اندروید و پس از اجازه گوشی تنظیم می‌شوند.";
  const result = await scheduler.sync(async () => {
    const response = await fetch("/api/agent/alarms", { cache: "no-store" });
    if (!response.ok) throw new Error("sync failed");
    const body: { data?: unknown } = await response.json();
    if (!Array.isArray(body.data) || !body.data.every(validReminder)) throw new Error("Invalid device reminder response");
    return body.data.map(row => ({
      id: nativeNotificationId(row.id), at: Date.parse(row.scheduledFor), alarm: row.channel === "ALARM",
      title: "همراه", body: row.title, extra: { reminderId: row.id },
    }));
  });
  if (result.permissionRequired) return "ثبت انجام شد؛ Notification به اجازه در تنظیمات اعلان نیاز دارد.";
  const exact = result.scheduled ? await LocalNotifications.checkExactNotificationSetting() : undefined;
  return `${result.scheduled} یادآوری جدید تنظیم شد؛ ${result.retained} یادآوری قبلی حفظ شد.` +
    (exact && exact.exact_alarm !== "granted" ? " مجوز Alarm دقیق داده نشده؛ زمان اجرا ممکن است جابه‌جا شود." : "") +
    (result.legacySound ? ` ${LEGACY_ALARM_SOUND_HELP}` : "");
}
