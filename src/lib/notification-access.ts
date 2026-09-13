"use client";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { enablePushNotifications } from "@/lib/push-client";

// Permission is not delivery. Native WebViews must never enter the Web Push path.
// This action does not create tasks, send a test alert or change reminder times.
export async function enableNotificationsForDevice() {
  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() !== "android" || !Capacitor.isPluginAvailable("LocalNotifications")) {
      return { mode: "native", enabled: false, message: "ارتباط با اعلان گوشی در دسترس نیست؛ برنامه را دوباره باز کن." } as const;
    }
    try {
      let permission = await LocalNotifications.checkPermissions();
      if (permission.display !== "granted") permission = await LocalNotifications.requestPermissions();
      if (permission.display !== "granted") {
        return { mode: "native", enabled: false, message: "اجازه Notification داده نشد؛ آن را در تنظیمات همین برنامه در گوشی فعال کن." } as const;
      }
      let alarmNote = "";
      try {
        const exact = await LocalNotifications.checkExactNotificationSetting();
        if (exact.exact_alarm !== "granted") alarmNote = " برای زمان دقیق Alarm، مجوز آن را از تنظیمات برنامه فعال کن.";
      } catch {
        alarmNote = " وضعیت مجوز Alarm مشخص نشد؛ آن را از تنظیمات برنامه بررسی کن.";
      }
      // Existing account synchronization handles only previously approved reminders.
      // Do not open the separate exact-alarm settings or request Web Push here.
      return { mode: "native", enabled: true, message: `مجوز Notification گوشی فعال است؛ دریافت یادآوری هنوز باید آزمایش شود.${alarmNote}` } as const;
    } catch {
      return { mode: "native", enabled: false, message: "بررسی مجوز Notification گوشی انجام نشد؛ دوباره تلاش کن." } as const;
    }
  }

  const result = await enablePushNotifications();
  return {
    mode: result.mode,
    enabled: true,
    message: result.mode === "push"
      ? "ثبت Push انجام شد؛ دریافت اعلان هنوز باید روی دستگاه آزمایش شود."
      : "اعلان مرورگر فعال شد؛ Push سرور هنوز فعال نیست.",
  } as const;
}
