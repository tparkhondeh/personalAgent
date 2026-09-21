import { describe, expect, it } from "vitest";
import { modelReviewQuestions } from "./agent-review-questions";
describe("approval is not a missing field", () => {
  it.each(["می‌خواهید این جلسه ساخته شود؟", "آیا می‌خواهید این جلسه ایجاد شود؟", "می خواهید این جلسه ثبت شود؟"])("does not block an unchanged valid proposal on approval-only wording: %s", question => {
    expect(modelReviewQuestions([question], { entity: "MEETING", date: "2026-09-24", time: "18:00" })).toEqual([]);
    expect(modelReviewQuestions([question], { entity: "TASK", date: "2026-09-24", time: "18:00" })).toEqual([question]);
    expect(modelReviewQuestions([question])).toEqual([question]);
  });
  it.each(["می‌خواهید این جلسه ساخته شود یا جلسه قبلی تغییر کند؟", "می‌خواهید این جلسه فردا ساخته شود؟", "می‌خواهید این جلسه ساخته شود؟ کدام علی؟", "می‌خواهید این جلسه حذف شود؟"])("retains qualified or destructive confirmation: %s", question => {
    expect(modelReviewQuestions([question], { entity: "MEETING", date: "2026-09-24", time: "18:00" })).toEqual([question]);
  });
  it("recognizes the observed dated confirmation only when all details match", () => {
    const q = "تأیید می‌کنید این جلسه برای 2026-09-17 ساعت 17:00 ایجاد شود؟ (بله/خیر یا بگویید مرتبط/تکراری است)";
    const plan = { entity: "MEETING", date: "2026-09-17", time: "17:00" };
    expect(modelReviewQuestions([q], plan)).toEqual([]);
    expect(modelReviewQuestions([q], { ...plan, time: "16:00" })).toEqual([q]);
    expect(modelReviewQuestions([q], { ...plan, entity: "TASK" })).toEqual([q]);
    expect(modelReviewQuestions([q])).toEqual([q]);
  });
  it("preserves real missing details and uncertainty", () => {
    const questions = ["کدام علی؟", "ساعت پنج صبح یا عصر؟", "آیا این پیشنهاد را برای جمعه تأیید می‌کنید؟"];
    expect(modelReviewQuestions(questions)).toEqual(questions);
    expect(modelReviewQuestions(["می‌خواهید این پیش‌نویس تأیید و ساخته شود؟"])).toEqual([]);
  });
  it.each([
    "قرارداد کوتاه‌مدت را حذف کنم یا قرارداد بلندمدت؟",
    "جلسه «سکوت» را تغییر بدهم یا جلسه فروش؟",
    "کدام کار «بررسی منطقه زمانی» را تکمیل کنم؟",
    "مدت جلسه چقدر باشد و کدام علی دعوت شود؟",
    "منطقه زمانی چیست و جلسه برای چه روزی باشد؟",
    "ساعات سکوت چه زمانی باشد؟ کدام جلسه را تغییر بدهم؟",
  ])("preserves ambiguity even when it mentions a default field: %s", question => {
    expect(modelReviewQuestions([question], { entity: "MEETING", date: "2026-09-17", time: "17:00" })).toEqual([question]);
  });
  it("omits only complete questions about fixed defaults", () => {
    expect(modelReviewQuestions([
      "مدت جلسه چقدر باشد؟", "مدت جلسه چند دقیقه باشد؟",
      "ساعات سکوت چه زمانی باشد؟", "منطقه زمانی چیست؟",
    ])).toEqual([]);
  });
});
