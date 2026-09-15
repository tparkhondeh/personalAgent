import { describe, expect, it } from "vitest";
import { modelReviewQuestions } from "./agent-review-questions";
describe("approval is not a missing field", () => {
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
});
