import { describe, expect, it } from "vitest";
import { extractPersianTitle, normalizePlanForReview, planPersian, plannedReminderTimes } from "./agent-planner";
const now=new Date("2026-09-06T08:00:00Z");
export const titleCases=[
  ["فردا ساعت پنج عصر جلسه با تیم فروش دارم؛ سه ساعت قبل یادم بنداز","جلسه با تیم فروش"],
  ["فردا ساعت ۱۷:۳۰ خرید دارو را ثبت کن","خرید دارو"],
  ["سه‌شنبه بعد ساعت بیست و سه گزارش فروش را ثبت کن","گزارش فروش"],
  ["۱۴۰۵/۰۶/۱۶ ساعت پنج و نیم عصر جلسه با علی دارم","جلسه با علی"],
  ["پس‌فردا ساعت ۵ عصر خرید شیر و نان، یک ساعت قبل یادم بنداز","خرید شیر و نان"],
  ["امروز ساعت 17 گزارش مالی ثبت کن و آلارم هم بگذار","گزارش مالی"],
  ["لطفا یک جلسه با تیم محصول فردا ساعت 17 ثبت کن","جلسه با تیم محصول"],
  ["هر هفته برای 3 نوبت ساعت 17 گزارش پروژه بساز","گزارش پروژه"],
  ["فردا ساعت 18 پیگیری قرارداد با شرکت سپهر را ثبت کن","پیگیری قرارداد با شرکت سپهر"],
  ["عنوانش رو «بررسی بودجه تابستان» بذار","بررسی بودجه تابستان"],
  ["عنوان را خرید دارو بگذار","خرید دارو"],
  ["گزارش فروش را تکمیل کن","گزارش فروش"],
  ["جلسه با تیم فروش را حذف کن","جلسه با تیم فروش"],
];
describe("simplified planner",()=>{
  it.each(titleCases)("extracts meaningful title: %s",(message,title)=>expect(extractPersianTitle(message)).toBe(title));
  it("uses documented internal duration without blocking unchanged registration",()=>{const r=planPersian(titleCases[0][0],{now});expect(r.plan?.durationMinutes).toBe(60);expect(r.questions).toEqual([]);});
  it("changes only the current proposal title",()=>{const first=planPersian("فردا ساعت 17 گزارش بساز",{now}).plan!;const next=planPersian('عنوانش رو «گزارش فروش» بذار',{now,previous:first}).plan!;expect(next.title).toBe("گزارش فروش");expect(next.date).toBe(first.date);expect(next.operation).toBe("CREATE");});
  it("preserves an existing meeting duration",()=>{const item={id:"m1",title:"جلسه با علی",entity:"MEETING" as const,startsAt:"2026-09-07T13:30:00Z",endsAt:"2026-09-07T14:15:00Z",updatedAt:"2026-09-05T00:00:00Z"};const p=planPersian("جلسه با علی را تغییر بده؛ فردا ساعت 18",{now,items:[item]}).plan!;expect(p.durationMinutes).toBe(45);});
  it("ignores old preferences for fresh reminders but preserves approved old schedules",()=>{
    const p=planPersian("فردا ساعت 09 گزارش بساز؛ 3 ساعت قبل یادم بنداز",{now,quietStart:"22:00",quietEnd:"08:00"}).plan!;
    expect(plannedReminderTimes(p,now)[0].scheduledFor).toBe("2026-09-07T02:30:00.000Z");
    const legacy={...p,quietStart:"22:00",quietEnd:"08:00"};
    expect(plannedReminderTimes(legacy,now)[0].scheduledFor).toBe("2026-09-07T04:30:00.000Z");
    normalizePlanForReview(p);expect(legacy.quietStart).toBe("22:00");
  });
});
