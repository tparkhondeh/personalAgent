import { describe, expect, it } from "vitest";
import { extractPersianTitle, planPersian } from "./agent-planner";

const cases=[
  ["پس‌فردا ساعت ده صبح یادم بنداز به علی بابت قرارداد زنگ بزنم","تماس با علی درباره قرارداد"],
  ["گزارش فروش ماهانه رو تا شنبه آماده کنم","آماده‌سازی گزارش فروش ماهانه"],
  ["فردا ساعت پنج عصر جلسه با تیم فروش دارم؛ سه ساعت قبل یادم بنداز","جلسه با تیم فروش"],
  ["فردا ساعت ۱۷ یادآوری کن با سارا تماس بگیرم","تماس با سارا"],
  ["فردا ساعت 18 یادم بنداز که قبض برق رو پرداخت کنم","پرداخت قبض برق"],
  ["پس فردا ساعت 17 یادم بنداز شیر و نان بخرم","خرید شیر و نان"],
  ["لطفا یادم بنداز فردا ساعت ۱۸ گزارش تیم محصول رو تهیه کنم","آماده‌سازی گزارش تیم محصول"],
  ["فردا ساعت ۱۸ خرید ۲ بسته دارو را ثبت کن","خرید ۲ بسته دارو"],
  ["فردا ساعت ۱۷ مطالعه فصل پنج کتاب رو ثبت کن","مطالعه فصل پنج کتاب"],
  ["فردا ساعت 18 خرید کتاب «فردا» را ثبت کن","خرید کتاب فردا"],
  ["امروز ساعت 17 مطالعه «ساعت پنج عصر» را ثبت کن","مطالعه ساعت پنج عصر"],
  ["فردا ساعت 18 بررسی سامانه اعلان شرکت را ثبت کن","بررسی سامانه اعلان شرکت"],
  ["فردا ساعت 17 خرید ساعت پنج عقربه را ثبت کن","خرید ساعت پنج عقربه"],
  ["برای شنبه ساعت 17 پیگیری قرارداد شماره ۱۲۳ را ثبت کن","پیگیری قرارداد شماره ۱۲۳"],
  ["فردا ساعت 17 اینو ثبت کن",""],
  ["فردا ساعت 17 یادم بنداز",""],
  ["نامش رو پیگیری قرارداد بگذار","پیگیری قرارداد"],
  ["فردا ساعت 17 انتخاب عنوان مقاله را ثبت کن","انتخاب عنوان مقاله"],
] as const;
describe("subject extraction, not destructive reminder splitting",()=>{
  it('does not classify قرارداد as a قرار meeting',()=>expect(planPersian(cases[0][0]).plan?.entity).toBe('TASK'));
  it('reads the clock after a mid-sentence reminder introducer',()=>expect(planPersian('فردا یادم بنداز ساعت ده صبح به علی زنگ بزنم').plan?.time).toBe('10:00'));
  it('does not treat a quoted book title as scheduling metadata',()=>{const p=planPersian('مطالعه کتاب «جلسه فردا ساعت پنج» را ثبت کن').plan!;expect(p.date).toBe('');expect(p.time).toBe('');expect(p.entity).toBe('TASK');});
  it.each(cases)("%s",(message,expected)=>expect(extractPersianTitle(message)).toBe(expected));
  it("asks for a real subject instead of inventing it",()=>expect(planPersian(cases[14][0]).questions).toContain("عنوان کار یا جلسه چیست؟"));
  it.each(["عنوانش رو «جلسه شنبه ساعت پنج» بذار","تیتر را «جلسه شنبه ساعت پنج» بگذار"])("keeps title-only correction separate from scheduling: %s",message=>{
    const now=new Date("2026-09-06T08:00:00Z");
    const first=planPersian("فردا ساعت 17 گزارش فروش بساز؛ 3 ساعت قبل یادم بنداز",{now}).plan!;
    const original=structuredClone(first);
    const next=planPersian(message,{now,previous:first}).plan!;
    expect(next).toEqual({...first,title:"جلسه شنبه ساعت پنج"});expect(first).toEqual(original);
  });
});
