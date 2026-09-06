"use client";

import Link from "next/link";
import { Time24Field } from "@/components/persian-date-time";
import { FormEvent, useEffect, useState } from "react";
import { enableNativeEscalationAlarms, isNativeAndroid } from "@/lib/native-escalations";
import { DEFAULT_REMINDER_OFFSETS, REMINDER_OFFSET_OPTIONS } from "@/lib/reminder-offsets";

type WorkingDay = "SAT" | "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI";

export type UserPreferences = {
  timezone: string;
  locale: string;
  workdayStartsAt: string;
  workdayEndsAt: string;
  workingDays: WorkingDay[];
  defaultReminderMins: number;
  defaultReminderOffsets: number[];
  quietHoursStartsAt: string;
  quietHoursEndsAt: string;
  urgentEscalationEnabled: boolean;
  urgentRepeatMinutes: number;
  urgentMaxRepeats: number;
  androidAlarmEnabled: boolean;
  highPriorityEnabled: boolean;
  smsEscalationEnabled: boolean;
  callEscalationEnabled: boolean;
  emergencyContactName: string | null;
  emergencyPhone: string | null;
};

export const defaultPreferences: UserPreferences = {
  timezone: "Asia/Tehran",
  locale: "fa-IR",
  workdayStartsAt: "09:00",
  workdayEndsAt: "18:00",
  workingDays: ["SAT", "SUN", "MON", "TUE", "WED"],
  defaultReminderMins: 60,
  defaultReminderOffsets: [...DEFAULT_REMINDER_OFFSETS],
  quietHoursStartsAt: "22:00",
  quietHoursEndsAt: "08:00",
  urgentEscalationEnabled: true,
  urgentRepeatMinutes: 15,
  urgentMaxRepeats: 3,
  androidAlarmEnabled: true,
  highPriorityEnabled: true,
  smsEscalationEnabled: false,
  callEscalationEnabled: false,
  emergencyContactName: null,
  emergencyPhone: null,
};

const dayLabels: Array<[WorkingDay, string]> = [["SAT", "شنبه"], ["SUN", "یکشنبه"], ["MON", "دوشنبه"], ["TUE", "سه‌شنبه"], ["WED", "چهارشنبه"], ["THU", "پنجشنبه"], ["FRI", "جمعه"]];

export function PreferencesPanel({ initial, signedIn, onSaved, onNativePermissionChanged }: { initial: UserPreferences | null; signedIn: boolean; onSaved: (preference: UserPreferences) => void; onNativePermissionChanged?: () => void }) {
  const starting = initial || defaultPreferences;
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>(starting.workingDays);
  const [reminderOffsets, setReminderOffsets] = useState<number[]>(starting.defaultReminderOffsets);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [nativeAndroid, setNativeAndroid] = useState(false);
  const [nativeStatus, setNativeStatus] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setNativeAndroid(isNativeAndroid()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleDay(day: WorkingDay) {
    setWorkingDays((days) => days.includes(day) ? days.filter((value) => value !== day) : [...days, day]);
  }

  function toggleReminderOffset(minutes: number) {
    setReminderOffsets((offsets) => {
      if (!offsets.includes(minutes)) {
        setStatus("");
        return [...offsets, minutes].sort((left, right) => right - left);
      }
      if (offsets.length <= 2) {
        setStatus("حداقل دو زمان یادآوری باید فعال بماند.");
        return offsets;
      }
      setStatus("");
      return offsets.filter((value) => value !== minutes);
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workingDays.length) { setStatus("حداقل یک روز کاری انتخاب کن."); return; }
    if (reminderOffsets.length < 2) { setStatus("حداقل دو زمان یادآوری انتخاب کن."); return; }
    const data = new FormData(event.currentTarget);
    const body: UserPreferences = {
      timezone: starting.timezone,
      locale: "fa-IR",
      workdayStartsAt: String(data.get("workdayStartsAt")),
      workdayEndsAt: String(data.get("workdayEndsAt")),
      workingDays,
      defaultReminderMins: Math.min(...reminderOffsets),
      defaultReminderOffsets: reminderOffsets,
      quietHoursStartsAt: starting.quietHoursStartsAt,
      quietHoursEndsAt: starting.quietHoursEndsAt,
      urgentEscalationEnabled: data.has("urgentEscalationEnabled"),
      urgentRepeatMinutes: Number(data.get("urgentRepeatMinutes")),
      urgentMaxRepeats: Number(data.get("urgentMaxRepeats")),
      androidAlarmEnabled: data.has("androidAlarmEnabled"),
      highPriorityEnabled: data.has("highPriorityEnabled"),
      smsEscalationEnabled: data.has("smsEscalationEnabled"),
      callEscalationEnabled: data.has("callEscalationEnabled"),
      emergencyContactName: String(data.get("emergencyContactName") || "").trim() || null,
      emergencyPhone: String(data.get("emergencyPhone") || "").trim() || null,
    };
    setPending(true); setStatus("");
    try {
      const response = await fetch("/api/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.data) { setStatus(result?.error || "ذخیره تنظیمات انجام نشد."); return; }
      onSaved(result.data as UserPreferences);
      setStatus("تنظیمات ذخیره شد.");
    } catch {
      setStatus("ارتباط با برنامه برقرار نشد؛ دوباره تلاش کن.");
    } finally {
      setPending(false);
    }
  }

  async function enableAndroidAlarm() {
    setNativeStatus("در حال بررسی مجوزهای اندروید...");
    try {
      const result = await enableNativeEscalationAlarms();
      setNativeStatus(result.message);
      if (result.enabled) onNativePermissionChanged?.();
    } catch {
      setNativeStatus("بررسی مجوز Alarm انجام نشد؛ دوباره تلاش کن.");
    }
  }

  if (!signedIn) return <section className="preferences-card preferences-signin"><p className="eyebrow">شناخت شخصی</p><h2>تنظیمات کار و یادآوری</h2><p>برای ذخیره ساعت کاری، روزهای آزاد و زمان یادآوری ابتدا وارد حساب شو.</p><Link className="submit-button" href="/login">ورود یا ساخت حساب</Link></section>;

  return <section className="preferences-card"><div className="preferences-heading"><div><p className="eyebrow">شناخت اولیه</p><h2>{initial ? "تنظیمات برنامه‌ریزی" : "تنظیمات اولیه"}</h2><p>ساعت‌های کاری و زمان یادآوری‌ها را تنظیم کن.</p></div></div><form onSubmit={save}><div className="field-grid"><label>شروع ساعت کاری<Time24Field name="workdayStartsAt" label="شروع ساعت کاری" required defaultValue={starting.workdayStartsAt} /></label><label>پایان ساعت کاری<Time24Field name="workdayEndsAt" label="پایان ساعت کاری" required defaultValue={starting.workdayEndsAt} /></label></div><fieldset><legend>روزهای کاری</legend><div className="working-days">{dayLabels.map(([day, label]) => <label className={workingDays.includes(day) ? "selected" : ""} key={day}><input type="checkbox" checked={workingDays.includes(day)} onChange={() => toggleDay(day)} />{label}</label>)}</div></fieldset><fieldset className="reminder-settings"><legend>یادآوری‌های پیش‌فرض</legend><p className="preference-note">دو یا سه زمان را هم‌زمان انتخاب کن. این انتخاب‌ها برای کارها و جلسات جدید استفاده می‌شوند.</p><div className="reminder-options">{REMINDER_OFFSET_OPTIONS.map((option) => <label className={reminderOffsets.includes(option.minutes) ? "selected" : ""} key={option.minutes}><input type="checkbox" checked={reminderOffsets.includes(option.minutes)} onChange={() => toggleReminderOffset(option.minutes)} /><span><strong>{option.label}</strong><small>{reminderOffsets.includes(option.minutes) ? "فعال" : "غیرفعال"}</small></span></label>)}</div></fieldset><fieldset className="escalation-settings"><legend>هشدار کار فوری عقب‌افتاده</legend><p className="preference-note">پیامک و تماس فعلاً فقط ثبت آزمایشی می‌شوند و هیچ شماره‌ای ارسال یا هزینه‌ای ایجاد نمی‌شود.</p><div className="preference-options"><label className="toggle-row"><input name="urgentEscalationEnabled" type="checkbox" defaultChecked={starting.urgentEscalationEnabled} /><span><strong>فعال‌سازی هشدار چندمرحله‌ای</strong><small>اعلان فوری و پیگیری مرحله‌به‌مرحله</small></span></label><label className="toggle-row"><input name="androidAlarmEnabled" type="checkbox" defaultChecked={starting.androidAlarmEnabled} /><span><strong>Alarm محلی اندروید</strong><small>روی گوشی و بدون سرویس پولی</small></span></label><label className="toggle-row"><input name="highPriorityEnabled" type="checkbox" defaultChecked={starting.highPriorityEnabled} /><span><strong>اعلان با اولویت بالا</strong><small>هشدار واضح‌تر در محدوده مجاز سیستم‌عامل</small></span></label><label className="toggle-row"><input name="smsEscalationEnabled" type="checkbox" defaultChecked={starting.smsEscalationEnabled} /><span><strong>پیامک آزمایشی</strong><small>فقط Mock؛ ارسال واقعی غیرفعال است</small></span></label><label className="toggle-row"><input name="callEscalationEnabled" type="checkbox" defaultChecked={starting.callEscalationEnabled} /><span><strong>تماس آزمایشی</strong><small>فقط Mock؛ تماس واقعی غیرفعال است</small></span></label></div><div className="field-grid"><label>فاصله تکرار<select name="urgentRepeatMinutes" defaultValue={String(starting.urgentRepeatMinutes)}><option value="10">۱۰ دقیقه</option><option value="15">۱۵ دقیقه</option><option value="30">۳۰ دقیقه</option><option value="60">۱ ساعت</option></select></label><label>حداکثر تکرار<select name="urgentMaxRepeats" defaultValue={String(starting.urgentMaxRepeats)}><option value="1">۱ بار</option><option value="2">۲ بار</option><option value="3">۳ بار</option><option value="4">۴ بار</option><option value="6">۶ بار</option></select></label></div><div className="field-grid"><label>نام مخاطب اضطراری<input name="emergencyContactName" maxLength={100} defaultValue={starting.emergencyContactName || ""} placeholder="اختیاری" /></label><label>شماره تماس تأییدشده<input name="emergencyPhone" dir="ltr" inputMode="tel" maxLength={30} defaultValue={starting.emergencyPhone || ""} placeholder="فعلاً فقط نگهداری امن" /></label></div>{nativeAndroid && <div className="native-alarm-control"><button className="outline-button" type="button" onClick={() => void enableAndroidAlarm()}>فعال‌سازی مجوز Alarm اندروید</button>{nativeStatus && <p role="status">{nativeStatus}</p>}</div>}</fieldset>{status && <p className="preference-status" role="status">{status}</p>}<button className="submit-button" disabled={pending}>{pending ? "در حال ذخیره..." : "ذخیره تنظیمات"}</button></form></section>;
}
