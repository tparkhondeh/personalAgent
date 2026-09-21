// Approval is handled by the explicit Register action, not a missing field.
// Match only complete boilerplate; retain genuine/qualified questions.
const confirmationOnly = new Set([
  "می خواهید این پیش نویس تأیید و ساخته شود",
  "آیا می خواهید این پیش نویس تأیید و ساخته شود",
  "آیا این پیشنهاد را تأیید می کنید",
  "این برنامه را ثبت کنم",
  "می خواهید این برنامه را ثبت کنم",
  "آیا این پیش نویس را ثبت کنم",
]);
// Only complete, standalone questions about fixed defaults are redundant.
const fixedDefaultQuestions = new Set([
  "مدت جلسه چقدر باشد", "مدت جلسه چند دقیقه باشد",
  "ساعات سکوت چه زمانی باشد", "منطقه زمانی چیست",
]);
export function modelReviewQuestions(questions: string[], plan?: { date: string | null; time: string | null; entity: string } | null) {
  return questions.filter(question => {
    const normalized = question.normalize("NFC").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/تایید/g, "تأیید").replace(/\u200c/g, " ").replace(/[؟?!.]+$/g, "").trim().replace(/\s+/g, " ");
    if (confirmationOnly.has(normalized) || fixedDefaultQuestions.has(normalized)) return false;
    // Real GPT follow-up: a complete plan was blocked by this approval-only
    // question. Match the whole sentence and the proposal's entity; never drop
    // qualified questions about people, dates, alternatives or deletion.
    const createConfirmation = normalized.match(/^(?:آیا )?می خواهید این (جلسه|کار) (?:ساخته|ایجاد|ثبت) شود$/);
    if (createConfirmation && plan && createConfirmation[1] === (plan.entity === "MEETING" ? "جلسه" : "کار")) return false;
    const scheduledConfirmation = normalized.match(/^تأیید می کنید این (جلسه|کار) برای (\d{4}-\d{2}-\d{2}) ساعت (\d{2}:\d{2}) ایجاد شود[؟?]?(?: \(بله\/خیر یا بگویید مرتبط\/تکراری است\))?$/);
    if (scheduledConfirmation && plan && scheduledConfirmation[2] === plan.date && scheduledConfirmation[3] === plan.time && scheduledConfirmation[1] === (plan.entity === "MEETING" ? "جلسه" : "کار")) return false;
    return true;
  });
}
