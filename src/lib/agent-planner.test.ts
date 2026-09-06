import { describe, expect, it } from "vitest";
import { inspectPlan, normalizePersian, planInstant, planPersian, planOccurrences, plannedReminderTimes } from "./agent-planner";
import { createLocalAgentResponse } from "./local-agent";
const now=new Date("2026-09-06T08:00:00Z");
const context={now,timezone:"Asia/Tehran"};
const acceptance="فردا ساعت پنج عصر جلسه با تیم فروش دارم؛ یک روز قبل، سه ساعت قبل و یک ساعت قبل یادم بنداز و آلارم هم بگذار.";
describe("Persian planning acceptance corpus",()=>{
  it("extracts the full acceptance example with the documented internal duration",()=>{
    const result=planPersian(acceptance,context);
    expect(result.plan).toMatchObject({entity:"MEETING",title:"جلسه با تیم فروش",category:"WORK",date:"2026-09-07",time:"17:00",durationMinutes:60,reminderOffsets:[1440,180,60],channels:["IN_APP","ALARM"]});
    expect(result.questions).toEqual([]);
  });
  it.each(["۵","5","٥","پنج"])("understands numeral %s",word=>{
    expect(planPersian(`فردا ساعت ${word} عصر گزارش را ثبت کن`,context).plan?.time).toBe("17:00");
  });
  it.each([["پس‌فردا","2026-09-08"],["فردا","2026-09-07"],["امروز","2026-09-06"],["سه‌شنبه بعد","2026-09-08"],["جمعه","2026-09-11"],["شنبه","2026-09-12"]])("resolves %s",(day,date)=>{
    expect(planPersian(`${day} ساعت ۱۷ گزارش را ثبت کن`,context).plan?.date).toBe(date);
  });
  it.each([["۱۴۰۵/۰۶/۱۶","2026-09-07"],["2026/09/07","2026-09-07"]])("converts date %s",(date,expected)=>expect(planPersian(`${date} ساعت 17 گزارش بساز`,context).plan?.date).toBe(expected));
  it.each(["فردا عصر جلسه با تیم دارم","فردا جلسه با تیم دارم"])("asks instead of guessing: %s",message=>{
    const result=planPersian(message,context);expect(result.plan?.time).toBe("");expect(result.plan?.durationMinutes).toBe(60);expect(result.questions.length).toBeGreaterThan(0);
  });
  it("adds rather than duplicates reminders in the same proposal",()=>{
    const first=planPersian("فردا ساعت 17 گزارش بساز؛ سه ساعت قبل یادم بنداز",context);
    const next=planPersian("یک روز قبل هم یادآوری کن",{...context,previous:first.plan});
    expect(next.plan?.reminderOffsets).toEqual([1440,180]);expect(next.plan?.title).toBe(first.plan?.title);
  });
  it("continues corrections for time, category and duration",()=>{
    const first=planPersian(acceptance,context);
    const second=planPersian("نه، ساعت چهار عصر",{...context,previous:first.plan});
    const third=planPersian("این یکی شرکتیه؛ مدت 45 دقیقه",{...context,previous:second.plan});
    expect(third.plan).toMatchObject({title:first.plan?.title,time:"16:00",category:"WORK",durationMinutes:45});
  });
  it("keeps reminder time separate from meeting start",()=>{
    expect(planPersian("فردا ساعت 10 صبح جلسه فروش دارم؛ 3 ساعت قبل یادآوری کن",context).plan).toMatchObject({time:"10:00",reminderOffsets:[180]});
  });
  it("clarifies morning/evening and understands the short follow-up",()=>{
    const first=planPersian("فردا ساعت پنج جلسه فروش دارم",context);expect(first.plan?.time).toBe("");expect(first.questions.join(" ")).toContain("صبح");
    const second=planPersian("عصر",{...context,previous:first.plan});expect(second.plan?.time).toBe("17:00");expect(second.plan?.ambiguousTime).toBeNull();
  });
  it("requires selection for identical existing titles",()=>{
    const result=planPersian("گزارش را حذف کن",{...context,items:[{id:"a",title:"گزارش"},{id:"b",title:"گزارش"}]});
    expect(result.plan?.targetId).toBeNull();expect(result.candidates).toHaveLength(2);expect(result.questions.join(" ")).toContain("کدام");
  });
  it("resolves one existing item and preserves a concurrency version",()=>{
    expect(planPersian("گزارش را تکمیل کن",{...context,items:[{id:"a",title:"گزارش",updatedAt:now.toISOString()}]}).plan).toMatchObject({operation:"COMPLETE",targetId:"a",targetUpdatedAt:now.toISOString()});
  });
  it("flags elapsed reminders, past due dates and conflicts",()=>{
    const result=planPersian("امروز ساعت 17 جلسه فروش دارم؛ مدت 60 دقیقه؛ یک روز قبل یادم بنداز",{...context,items:[{title:"تداخل",startsAt:"2026-09-06T13:40:00Z",endsAt:"2026-09-06T14:30:00Z"}]});
    expect(result.warnings.join(" ")).toContain("گذشته");expect(result.warnings.join(" ")).toContain("تداخل");
    expect(planPersian("امروز ساعت 08 گزارش بساز",context).questions.join(" ")).toContain("گذشته");
  });
  it("does not silently execute multiple requests",()=>expect(planPersian("گزارش بساز\nهمچنین خرید بساز",context).questions.join(" ")).toContain("چند درخواست"));
  it("asks for a bound on repetition rather than scheduling forever",()=>{
    const result=planPersian("فردا ساعت 17 هر هفته گزارش بساز",context);expect(result.plan?.recurrence).toBe("WEEKLY");expect(result.questions.join(" ")).toContain("نوبت");
  });
  it("creates the approved number of weekly occurrences and reminders",()=>{
    const result=planPersian("فردا ساعت 17 هر هفته برای 4 نوبت گزارش بساز؛ 1 ساعت قبل یادآوری کن",context);
    expect(result.questions).toEqual([]);expect(planOccurrences(result.plan!).map(o=>o.date)).toEqual(["2026-09-07","2026-09-14","2026-09-21","2026-09-28"]);expect(plannedReminderTimes(result.plan!,now)).toHaveLength(4);
  });
  it("honors a configured timezone and rejects nonexistent DST times",()=>{
    expect(planInstant("2026-09-07","17:00","Asia/Tehran")?.toISOString()).toBe("2026-09-07T13:30:00.000Z");
    expect(planInstant("2026-03-08","02:30","America/Los_Angeles")).toBeNull();
    expect(planInstant("2026-09-07","17:00","America/Los_Angeles")?.toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });
  it("rejects impossible wall times instead of clamping them",()=>{
    const result=planPersian("فردا ساعت 29:80 گزارش بساز",context);expect(inspectPlan(result.plan!,now).questions.join(" ")).toContain("معتبر نیست");
  });
  it("preserves letters inside Persian titles",()=>expect(planPersian("فردا ساعت 17 گزارش فروش دارم",context).plan?.title).toBe("گزارش فروش"));
  it("normalizes Arabic letters and compound number words",()=>expect(normalizePersian("ساعت بیست و سه و سی دقیقه")).toBe("ساعت 23 و 30 دقیقه"));
  it("shows measurable improvement over the frozen legacy parser",()=>{
    const before=createLocalAgentResponse({message:acceptance,now,tasks:[],meetings:[]});
    const after=planPersian(acceptance,context);
    expect(before.proposal.startsAt).not.toBe("2026-09-07T13:30:00.000Z");
    expect(after.instant).toBe("2026-09-07T13:30:00.000Z");
    expect(before.proposal.endsAt).toBeTruthy();expect(after.plan?.durationMinutes).toBe(60);
  });
});
