"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type WorkingDay = "SAT" | "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI";
type PlanningProfile = "BALANCED" | "FOCUS" | "FLEXIBLE";

export type UserPreferences = {
  timezone: string;
  locale: string;
  workdayStartsAt: string;
  workdayEndsAt: string;
  workingDays: WorkingDay[];
  defaultReminderMins: number;
  quietHoursStartsAt: string;
  quietHoursEndsAt: string;
  planningProfile: PlanningProfile;
};

export const defaultPreferences: UserPreferences = {
  timezone: "Asia/Tehran",
  locale: "fa-IR",
  workdayStartsAt: "09:00",
  workdayEndsAt: "18:00",
  workingDays: ["SAT", "SUN", "MON", "TUE", "WED"],
  defaultReminderMins: 15,
  quietHoursStartsAt: "22:00",
  quietHoursEndsAt: "08:00",
  planningProfile: "BALANCED",
};

const dayLabels: Array<[WorkingDay, string]> = [["SAT", "شنبه"], ["SUN", "یکشنبه"], ["MON", "دوشنبه"], ["TUE", "سه‌شنبه"], ["WED", "چهارشنبه"], ["THU", "پنجشنبه"], ["FRI", "جمعه"]];

export function PreferencesPanel({ initial, signedIn, onSaved }: { initial: UserPreferences | null; signedIn: boolean; onSaved: (preference: UserPreferences) => void }) {
  const starting = initial || defaultPreferences;
  const [workingDays, setWorkingDays] = useState<WorkingDay[]>(starting.workingDays);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  function toggleDay(day: WorkingDay) {
    setWorkingDays((days) => days.includes(day) ? days.filter((value) => value !== day) : [...days, day]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workingDays.length) { setStatus("حداقل یک روز کاری انتخاب کن."); return; }
    const data = new FormData(event.currentTarget);
    const body: UserPreferences = {
      timezone: "Asia/Tehran",
      locale: "fa-IR",
      workdayStartsAt: String(data.get("workdayStartsAt")),
      workdayEndsAt: String(data.get("workdayEndsAt")),
      workingDays,
      defaultReminderMins: Number(data.get("defaultReminderMins")),
      quietHoursStartsAt: String(data.get("quietHoursStartsAt")),
      quietHoursEndsAt: String(data.get("quietHoursEndsAt")),
      planningProfile: data.get("planningProfile") as PlanningProfile,
    };
    setPending(true); setStatus("");
    const response = await fetch("/api/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null);
    setPending(false);
    if (!response.ok) { setStatus(result?.error || "ذخیره تنظیمات انجام نشد."); return; }
    onSaved(result.data as UserPreferences);
    setStatus("تنظیمات ذخیره شد و از این پس در برنامه‌ریزی استفاده می‌شود.");
  }

  if (!signedIn) return <section className="preferences-card preferences-signin"><p className="eyebrow">شناخت شخصی</p><h2>برنامه را با سبک زندگی خودت هماهنگ کن</h2><p>برای ذخیره ساعت کاری، روزهای آزاد و زمان یادآوری ابتدا وارد حساب شو.</p><Link className="submit-button" href="/login">ورود یا ساخت حساب</Link></section>;

  return <section className="preferences-card"><div className="preferences-heading"><div><p className="eyebrow">شناخت اولیه</p><h2>{initial ? "تنظیمات برنامه‌ریزی" : "اول سبک روزت را مشخص کنیم"}</h2><p>همراه از این اطلاعات برای پیشنهاد زمان مناسب و جلوگیری از اعلان در ساعت استراحت استفاده می‌کند.</p></div><span>منطقه زمانی تهران</span></div><form onSubmit={save}><div className="field-grid"><label>شروع ساعت کاری<input name="workdayStartsAt" type="time" required defaultValue={starting.workdayStartsAt} /></label><label>پایان ساعت کاری<input name="workdayEndsAt" type="time" required defaultValue={starting.workdayEndsAt} /></label></div><fieldset><legend>روزهای کاری</legend><div className="working-days">{dayLabels.map(([day, label]) => <label className={workingDays.includes(day) ? "selected" : ""} key={day}><input type="checkbox" checked={workingDays.includes(day)} onChange={() => toggleDay(day)} />{label}</label>)}</div></fieldset><div className="field-grid"><label>یادآوری پیش‌فرض<select name="defaultReminderMins" defaultValue={String(starting.defaultReminderMins)}><option value="0">همان لحظه</option><option value="15">۱۵ دقیقه قبل</option><option value="30">۳۰ دقیقه قبل</option><option value="60">۱ ساعت قبل</option><option value="1440">یک روز قبل</option></select></label><label>سبک برنامه‌ریزی<select name="planningProfile" defaultValue={starting.planningProfile}><option value="BALANCED">متعادل</option><option value="FOCUS">تمرکز عمیق</option><option value="FLEXIBLE">انعطاف‌پذیر</option></select></label></div><div className="field-grid"><label>شروع زمان سکوت<input name="quietHoursStartsAt" type="time" required defaultValue={starting.quietHoursStartsAt} /></label><label>پایان زمان سکوت<input name="quietHoursEndsAt" type="time" required defaultValue={starting.quietHoursEndsAt} /></label></div>{status && <p className="preference-status" role="status">{status}</p>}<button className="submit-button" disabled={pending}>{pending ? "در حال ذخیره..." : "ذخیره تنظیمات"}</button></form></section>;
}
