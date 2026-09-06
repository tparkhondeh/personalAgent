window.HamrahInputs=(()=>{// Shared calendar arithmetic; stored dates remain Gregorian ISO, never browser-local dates.
const persianCalendar = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
const persianMonths = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const inputDigits = (s) => s.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const faDigits = (s) => String(s).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
function persianParts(iso) {
    const date = new Date(`${iso}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso)
        return null;
    const p = persianCalendar.formatToParts(date), get = (key) => Number(p.find(x => x.type === key)?.value);
    return { year: get("year"), month: get("month"), day: get("day") };
}
function jalaliToIso(year, month, day) {
    if (![year, month, day].every(Number.isInteger) || year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1 || day > 31)
        return "";
    const start = Date.UTC(year + 621, 2, 18);
    for (let i = 0; i < 370; i++) {
        const iso = new Date(start + i * 86400000).toISOString().slice(0, 10), p = persianParts(iso);
        if (p.year === year && p.month === month && p.day === day)
            return iso;
    }
    return "";
}
function dateInputValue(iso) {
    if (iso.startsWith("invalid:"))
        return iso.slice(8);
    const p = persianParts(iso);
    return p ? `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}` : "";
}
function parsePersianInput(value) {
    const text = inputDigits(value.trim());
    if (!text)
        return "";
    const match = text.match(/^(1[345]\d{2})[/-](\d{1,2})[/-](\d{1,2})$/);
    return (match && jalaliToIso(Number(match[1]), Number(match[2]), Number(match[3]))) || `invalid:${text}`;
}
const validTime24 = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(inputDigits(s));
function persianMonthGrid(year, month) {
    const first = jalaliToIso(year, month, 1);
    if (!first)
        return { offset: 0, days: [] };
    const start = Date.parse(`${first}T12:00:00Z`), days = [];
    for (let day = 1; day <= 31; day++) {
        const iso = new Date(start + (day - 1) * 86400000).toISOString().slice(0, 10);
        if (persianParts(iso)?.month !== month)
            break;
        days.push({ iso, day });
    }
    return { offset: (new Date(start).getUTCDay() + 1) % 7, days };
}

return {dateInputValue,parsePersianInput,persianParts,persianMonths,persianMonthGrid,inputDigits,faDigits,validTime24,jalaliToIso};})();
window.HamrahPlanner=(()=>{// Pure planner shared with the bundled Android shell. Never performs effects.
const DEFAULT_MEETING_MINUTES = 60;
function normalizePersian(text) {
    const words = { صفر: 0, یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60 };
    let result = text.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();
    // Weekday names must not be converted into number words.
    for (const [word, value] of Object.entries(words))
        result = result.replace(new RegExp(`(^|[\\s،؛])${word}(?=$|[\\s،؛])`, "g"), `$1${value}`);
    result = result.replace(/\b(20|30|40|50) و ([1-9])\b/g, (_, a, b) => String(Number(a) + Number(b)));
    return result;
}
function withoutLeadingReminder(text) {
    return text.replace(/^\s*(?:(?:لطفاً|لطفا)\s+)?(?:برام\s+)?(?:یادم\s*بنداز|یادآوری\s*کن)(?:\s+(?:که|تا))?\s*/, "");
}
function extractPersianTitle(message) {
    let text = message.replace(/\u200c/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک");
    const named = text.match(/(?:عنوان|تیتر|اسمش|اسم|نام)(?:ش)?\s*(?:را|رو)?\s*(?:بگذار|بذار|باشد|باشه|بشه|بکن)?\s*[«"“]([^»"”]+)[»"”]/);
    if (named)
        return named[1].trim().slice(0, 180);
    const n = "(?:[0-9۰-۹٠-٩]+|بیست(?:\\s+و\\s+(?:یک|دو|سه))?|دوازده|یازده|سیزده|چهارده|پانزده|شانزده|هفده|هجده|نوزده|ده|نه|هشت|هفت|شش|پنج|چهار|سه|دو|یک|صفر)";
    const clock = new RegExp("ساعت\\s*" + n + "(?::[0-9۰-۹٠-٩]{1,2}|\\s+و\\s+(?:نیم|ربع|" + n + ")(?:\\s+دقیقه)?)?(?:\\s*(?:بعد از ظهر|بعدازظهر|بامداد|عصر|صبح|ظهر|شب))?", "g");
    // Protect quoted subjects (book names, event names, numbers) from metadata parsing.
    const protectedSubjects = [];
    text = text.replace(/[«"“]([^»"”]+)[»"”]/g, (_, subject) => { protectedSubjects.push(subject); return `SUBJECTTOKEN${protectedSubjects.length - 1}END`; });
    text = text.replace(clock, (match, offset, source) => /(?:خرید|تعمیر|فروش|تعویض)\s*$/.test(source.slice(0, offset)) ? match : " ")
        .replace(/(?:برای\s+|تا\s+|در\s+|روز\s+)?[0-9۰-۹٠-٩]{4}[/-][0-9۰-۹٠-٩]{1,2}[/-][0-9۰-۹٠-٩]{1,2}/g, " ")
        .replace(/(^|[\s،])(?:(?:برای|تا|در|روز)\s+)?(?:پس فردا|پسفردا|فردا|امروز|(?:یک|دو|سه|چهار|پنج)\s*شنبه|شنبه|جمعه)(?:\s+(?:بعد|آینده))?(?=$|[\s،؛])/g, "$1 ");
    // Remove the reminder introducer AFTER its scheduling prefix, not the subject after it.
    text = withoutLeadingReminder(text.trim());
    text = text.split(/[؛;\n]/)[0]
        .replace(new RegExp(n + "\\s*(?:روز|ساعت|دقیقه)\\s*قبل.*$"), " ")
        .replace(/(?:،?\s+و?\s*)(?:یادم\s*بنداز|یادآوری\s*کن|(?:آلارم|الارم|هشدار|اعلان|alarm|notification)\s+(?:هم\s+)?(?:بگذار|بذار|بزن|فعال|تنظیم)).*$/i, " ")
        .replace(/(?:به مدت|مدت|طول جلسه)\s*[^،؛]+/g, " ")
        .replace(/(?:هر هفته|هر روز|هفتگی|روزانه)(?:\s+برای\s+[0-9۰-۹٠-٩]+\s*نوبت)?/g, " ")
        .replace(/^(?:نه[،\s]+)?(?:عنوان|تیتر|اسم|نام)(?:ش)?\s*(?:را|رو)?\s*/, " ")
        .replace(/(?:ثبت کن|اضافه کن|بساز|بذار|بگذار|بشه|باشد|باشه|تغییر بده|تغییر کن|عوض کن|حذف کن|پاک کن|تکمیل کن|انجام شد|دارم|لطفاً|لطفا)/g, " ")
        .replace(/(^|[\s،])(?:را|رو|برای من|برام|صبح|عصر|شب|بامداد|فوری|مهم|عادی|شخصی|شرکتی)(?=$|[\s،])/g, " ")
        .replace(/^\s*(?:یک|یه)\s+(?=جلسه|قرار|کار)/, "")
        .replace(/^\s*کار\s+(?=\S)/, "")
        .replace(/^[\s،:«"]+|[\s،.!؟»"]+$/g, "").replace(/\s+و\s*$/, "").replace(/\s+/g, " ").trim();
    text = text.replace(/^نه[،\s]+/, "").replace(/^(?:که|تا)\s+/, "");
    const call = text.match(/^(?:به|با)\s+(.+?)\s+(?:زنگ بزنم|زنگ بزن|تماس بگیرم|تماس بگیر)$/);
    if (call)
        text = "تماس با " + call[1].replace(/\s+بابت\s+/, " درباره ");
    const prepare = text.match(/^(.+?)\s+(?:آماده کنم|آماده کن|تهیه کنم|تهیه کن)$/);
    if (prepare)
        text = "آماده‌سازی " + prepare[1];
    const buy = text.match(/^(.+?)\s+(?:بخرم|بخر)$/);
    if (buy)
        text = "خرید " + buy[1];
    const pay = text.match(/^(.+?)\s+(?:پرداخت کنم|پرداخت کن)$/);
    if (pay)
        text = "پرداخت " + pay[1];
    text = text.replace(/SUBJECTTOKEN(\d+)END/g, (_, index) => protectedSubjects[Number(index)]);
    if (/^(?:این|اینو|آن|اونو|همون|اون کار|این کار|یه کار|یادم بنداز)$/.test(text))
        return "";
    return text.slice(0, 180);
}
// Only newly presented/edited proposals adopt the retired quiet-hours policy.
// Existing stored reminders and already-approved plans are not rewritten.
function normalizePlanForReview(plan, items = []) {
    plan.quietStart = "00:00";
    plan.quietEnd = "00:00";
    plan.defaults = plan.defaults.filter(d => !d.includes("سکوت"));
    if (plan.entity === "MEETING" && !plan.durationMinutes) {
        const item = items.find(i => i.id === plan.targetId);
        plan.durationMinutes = item?.startsAt && item.endsAt ? (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000 : DEFAULT_MEETING_MINUTES;
    }
    return plan;
}
function dateParts(date, timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const p = (type) => parts.find(x => x.type === type)?.value ?? "";
    return { date: `${p("year")}-${p("month")}-${p("day")}`, time: `${p("hour")}:${p("minute")}` };
}
// Shared, effect-free summary used before confirmation in web and bundled Android.
function approvalSummary(plan) {
    const fa = (n) => new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(n);
    const instant = planInstant(plan.date, plan.time, plan.timezone);
    const dateValue = new Date(`${plan.date}T12:00:00Z`);
    const date = plan.date ? (Number.isFinite(dateValue.getTime()) ? new Intl.DateTimeFormat("fa-IR", { calendar: "persian", timeZone: "UTC", dateStyle: "medium" }).format(dateValue) : "تاریخ نامعتبر") : "بدون تاریخ";
    const channelNames = { IN_APP: "داخل برنامه", PUSH: "Push", NATIVE: "Notification", ALARM: "Alarm گوشی" };
    return {
        category: plan.entity === "MEETING" ? "جلسه" : plan.category === "WORK" ? "شرکتی" : "شخصی",
        priority: ({ NORMAL: "عادی", IMPORTANT: "مهم", URGENT: "فوری" })[plan.priority],
        when: instant ? new Intl.DateTimeFormat("fa-IR", { calendar: "persian", timeZone: plan.timezone, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(instant) : `${date}${plan.time ? `، ${plan.time}` : "، ساعت تعیین نشده"}`,
        reminders: plan.reminderOffsets.map(m => m === 0 ? "زمان موعد" : m % 1440 === 0 ? `${fa(m / 1440)} روز قبل` : m % 60 === 0 ? `${fa(m / 60)} ساعت قبل` : `${fa(m)} دقیقه قبل`).join("، ") || "ندارد",
        channels: plan.channels.map(c => channelNames[c]).join("، ") || "بدون هشدار",
        recurrence: plan.recurrence === "NONE" ? "" : `${plan.recurrence === "DAILY" ? "روزانه" : "هفتگی"}، ${plan.occurrenceCount ? fa(plan.occurrenceCount) : "تعداد نامشخص"} نوبت`,
        followUp: plan.escalation ? `${fa(plan.repeatCount)} هشدار پس از موعد با فاصله ${fa(plan.repeatMinutes)} دقیقه` : "",
    };
}
function planInstant(date, time, timezone) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        return null;
    try {
        const wall = Date.parse(`${date}T${time}:00Z`);
        if (!Number.isFinite(wall))
            return null;
        let instant = wall;
        for (let n = 0; n < 3; n++) {
            const parts = dateParts(new Date(instant), timezone);
            instant += wall - Date.parse(`${parts.date}T${parts.time}:00Z`);
        }
        const check = dateParts(new Date(instant), timezone);
        return check.date === date && check.time === time ? new Date(instant) : null;
    }
    catch {
        return null;
    }
}
function shiftDay(day, count) {
    return new Date(Date.parse(`${day}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
}
function planOccurrences(plan) {
    const count = plan.recurrence === "NONE" ? 1 : plan.occurrenceCount ?? 0;
    if (!Number.isInteger(count) || count < 1 || count > 12 || !plan.date || !Number.isFinite(Date.parse(`${plan.date}T12:00:00Z`)))
        return [];
    return Array.from({ length: count }, (_, index) => ({ index, date: shiftDay(plan.date, index * (plan.recurrence === "WEEKLY" ? 7 : 1)) }))
        .map(item => ({ ...item, instant: planInstant(item.date, plan.time, plan.timezone)?.toISOString() ?? null }));
}
function plannedReminderTimes(plan, now = new Date()) {
    if (plan.operation !== "CREATE" && plan.operation !== "UPDATE")
        return [];
    return planOccurrences(plan).flatMap(occurrence => {
        if (!occurrence.instant)
            return [];
        const reference = Date.parse(occurrence.instant);
        return plan.reminderOffsets.filter(m => reference - m * 60000 > now.getTime()).map(offset => {
            let scheduled = reference - offset * 60000;
            const parts = dateParts(new Date(scheduled), plan.timezone), time = parts.time;
            const overnight = plan.quietStart > plan.quietEnd;
            const quiet = overnight ? time >= plan.quietStart || time < plan.quietEnd : time >= plan.quietStart && time < plan.quietEnd;
            if (quiet) {
                const endDate = overnight && time >= plan.quietStart ? shiftDay(parts.date, 1) : parts.date;
                const end = planInstant(endDate, plan.quietEnd, plan.timezone);
                if (end)
                    scheduled = end.getTime();
                else { // DST can skip the configured wall time. Find the first valid minute outside quiet hours.
                    for (let i = 0; i < 1440; i++) {
                        scheduled += 60000;
                        const next = dateParts(new Date(scheduled), plan.timezone).time;
                        if (!(overnight ? next >= plan.quietStart || next < plan.quietEnd : next >= plan.quietStart && next < plan.quietEnd))
                            break;
                    }
                }
            }
            return { occurrence: occurrence.index, offset, scheduledFor: new Date(scheduled).toISOString() };
        });
    });
}
function jalaliDate(year, month, day) {
    if (year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1 || day > 31)
        return "";
    const format = new Intl.DateTimeFormat("en-US-u-ca-persian", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" });
    const start = Date.UTC(year + 621, 2, 18);
    for (let i = 0; i < 370; i++) {
        const date = new Date(start + i * 86400000), p = format.formatToParts(date);
        const value = (key) => Number(p.find(x => x.type === key)?.value);
        if (value("year") === year && value("month") === month && value("day") === day)
            return date.toISOString().slice(0, 10);
    }
    return "";
}
function inspectPlan(plan, now = new Date(), items = []) {
    const questions = [], warnings = [];
    if (!Number.isInteger(plan.repeatCount) || plan.repeatCount < 1 || plan.repeatCount > 6)
        questions.push("تعداد هشدار باید از ۱ تا ۶ باشد.");
    if (!Number.isInteger(plan.repeatMinutes) || plan.repeatMinutes < 10 || plan.repeatMinutes > 1440)
        questions.push("فاصله هشدار باید از ۱۰ تا ۱۴۴۰ دقیقه باشد.");
    if (plan.occurrenceCount !== null && plan.occurrenceCount !== undefined && (!Number.isInteger(plan.occurrenceCount) || plan.occurrenceCount < 2 || plan.occurrenceCount > 12))
        questions.push("تعداد نوبت‌ها باید از ۲ تا ۱۲ باشد.");
    if (plan.durationMinutes !== null && (!Number.isInteger(plan.durationMinutes) || plan.durationMinutes < 5 || plan.durationMinutes > 1440))
        questions.push("مدت جلسه باید از ۵ تا ۱۴۴۰ دقیقه باشد.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.quietStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.quietEnd))
        questions.push("ساعات سکوت معتبر نیست.");
    if (plan.reminderOffsets.length > 8 || plan.reminderOffsets.some(m => !Number.isInteger(m) || m < 0 || m > 10080))
        questions.push("زمان یادآوری معتبر نیست.");
    if (plan.title.length > 180)
        questions.push("عنوان را کوتاه‌تر کن.");
    if (!plan.title.trim())
        questions.push("عنوان کار یا جلسه چیست؟");
    if (plan.operation !== "CREATE" && !plan.targetId)
        questions.push("کدام مورد را تغییر بدهم؟ از فهرست انتخاب کن.");
    const instant = planInstant(plan.date, plan.time, plan.timezone);
    const active = plan.operation === "CREATE" || plan.operation === "UPDATE";
    if (active) {
        if (plan.date && !plan.time)
            questions.push(plan.ambiguousTime ? "این ساعت صبح است یا عصر؟ می‌توانی ساعت ۲۴ساعته را هم مشخص کنی." : "دقیقاً چه ساعتی؟ ساعت را از ۰ تا ۲۳ مشخص کن.");
        if (plan.time && !plan.date)
            questions.push("برای چه تاریخی؟");
        if (plan.entity === "MEETING" && !plan.date)
            questions.push("جلسه چه روزی است؟");
        if ((plan.date || plan.time) && plan.date && plan.time && !instant)
            questions.push("این تاریخ یا ساعت معتبر نیست.");
        if (plan.reminderOffsets.length && !instant)
            questions.push("برای یادآوری، تاریخ و ساعت دقیق لازم است.");
        if (instant && instant.getTime() <= now.getTime())
            questions.push("زمان انتخاب‌شده گذشته است؛ زمان آینده را مشخص کن.");
        if (instant) {
            const past = plan.reminderOffsets.filter(m => instant.getTime() - m * 60000 <= now.getTime());
            if (past.length)
                warnings.push(`${past.length} یادآوری گذشته است و زمان‌بندی نمی‌شود.`);
            if (plan.entity === "MEETING" && plan.durationMinutes && items.some(item => item.id !== plan.targetId && item.startsAt && item.endsAt && new Date(item.startsAt).getTime() < instant.getTime() + plan.durationMinutes * 60000 && new Date(item.endsAt).getTime() > instant.getTime()))
                warnings.push("این جلسه با جلسه دیگری تداخل دارد.");
        }
        if (plan.recurrence !== "NONE" && !plan.occurrenceCount)
            questions.push("چند نوبت تکرار شود؟ از ۲ تا ۱۲ نوبت انتخاب کن.");
        if (plan.recurrence !== "NONE" && plan.operation !== "CREATE")
            questions.push("ویرایش گروهی تکرار مبهم است؛ تکرار را ندارد انتخاب کن تا فقط همین نوبت تغییر کند.");
        if (plan.recurrence !== "NONE" && plan.occurrenceCount && planOccurrences(plan).some(o => !o.instant))
            questions.push("یکی از ساعت‌های تکرار با تغییر ساعت رسمی نامعتبر می‌شود؛ ساعت دیگری انتخاب کن.");
    }
    if (plan.channels.includes("ALARM"))
        warnings.push("Alarm به اپ اندروید و مجوز گوشی نیاز دارد؛ تضمین اجرای دقیق وابسته به سیستم‌عامل است.");
    if (plan.channels.includes("NATIVE"))
        warnings.push("Notification پس از همگام‌سازی اپ اندروید با همین حساب و اجازه دستگاه تنظیم می‌شود.");
    if (plan.channels.includes("PUSH"))
        warnings.push("Push فقط روی دستگاه دارای اشتراک و مجوز اعلان ارسال می‌شود.");
    return { questions: [...new Set(questions)], warnings, instant: instant?.toISOString() ?? null };
}
function planPersian(message, context = {}) {
    const now = context.now ?? new Date(), timezone = context.timezone ?? "Asia/Tehran";
    const original = message.replace(/\u200c/g, " "), metadata = original.replace(/[«"“][^»"”]+[»"”]/g, " "), text = normalizePersian(metadata);
    // A title-only correction must not reinterpret dates/numbers in the new title
    // as scheduling instructions, or change operation/identity of the pending draft.
    if (context.previous && /^(?:نه[،\s]+)?(?:عنوان|تیتر|اسمش|نامش)(?:ش)?\s*(?:را|رو)?/.test(original.trim())) {
        const plan = normalizePlanForReview({ ...context.previous, title: extractPersianTitle(message), defaults: [...context.previous.defaults] }, context.items);
        const checked = inspectPlan(plan, now, context.items);
        return { plan, ...checked, candidates: [], reply: checked.questions[0] ?? "عنوان همین پیشنهاد اصلاح شد؛ بررسی و ثبت کن." };
    }
    const fresh = /(?:کار|جلسه|قرار).*(?:جدید|دیگر)|(?:جدید|دیگر).*(?:کار|جلسه|قرار)/.test(text);
    const previous = fresh ? null : context.previous;
    const plan = previous ? JSON.parse(JSON.stringify(previous)) : {
        operation: "CREATE", entity: /(^|[\s،])(?:جلسه|قرار)(?=$|[\s،؛])/.test(text) ? "MEETING" : "TASK", targetId: null, targetUpdatedAt: null,
        title: "", category: "PERSONAL", priority: "NORMAL", date: "", time: "", ambiguousTime: null, timezone,
        durationMinutes: null, recurrence: "NONE", occurrenceCount: null, reminderOffsets: [], channels: ["IN_APP"], repeatCount: 1, repeatMinutes: 15,
        quietStart: "00:00", quietEnd: "00:00", escalation: false, defaults: ["دسته شخصی، اولویت عادی و تنظیمات پیش‌فرض"],
    };
    const summary = !previous && /خلاصه|زمان آزاد|برنامه امروز/.test(text) && !/ثبت|بساز|دارم/.test(text);
    if (summary)
        return { plan: null, reply: `${context.items?.length ?? 0} کار باز؛ ${(context.items ?? []).slice(0, 4).map(i => i.title).join("، ") || "موردی ثبت نشده است."}`, questions: [], warnings: [], candidates: [], instant: null };
    const command = withoutLeadingReminder(text).replace(/یادم\s*بنداز|یادآوری\s*کن/g, " ").split(/[؛;]/)[0].split(/(?:آلارم|الارم|اعلان)/)[0];
    if (/حذف کن|پاک کن/.test(command))
        plan.operation = "DELETE";
    else if (/انجام شد|انجام دادم|تمام شد|تکمیل کن/.test(command))
        plan.operation = "COMPLETE";
    else if (/تغییر|ویرایش|عوض کن|ببر به/.test(command) && !previous)
        plan.operation = "UPDATE";
    if (/شرکت|شرکتی|کاری|تیم|فروش/.test(text))
        plan.category = "WORK";
    if (/شخصی/.test(text))
        plan.category = "PERSONAL";
    if (/شرکت|شرکتی|کاری|تیم|فروش|شخصی/.test(text))
        plan.defaults = plan.defaults.filter(d => !d.includes("دسته شخصی"));
    if (/فوری/.test(text))
        plan.priority = "URGENT";
    else if (/مهم/.test(text))
        plan.priority = "IMPORTANT";
    else if (/عادی/.test(text))
        plan.priority = "NORMAL";
    const today = dateParts(now, timezone).date;
    if (/پس فردا|پسفردا/.test(text))
        plan.date = shiftDay(today, 2);
    else if (/فردا/.test(text))
        plan.date = shiftDay(today, 1);
    else if (/امروز/.test(text))
        plan.date = today;
    const explicit = text.match(/\b(1[34]\d{2}|20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (explicit)
        plan.date = Number(explicit[1]) < 1700 ? jalaliDate(...explicit.slice(1).map(Number)) : `${explicit[1]}-${explicit[2].padStart(2, "0")}-${explicit[3].padStart(2, "0")}`;
    const weekdays = ["یکشنبه", "دوشنبه", "سه شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
    const weekdayText = metadata.replace(/یک شنبه/g, "یکشنبه").replace(/دو شنبه/g, "دوشنبه").replace(/چهار شنبه/g, "چهارشنبه").replace(/پنج شنبه/g, "پنجشنبه");
    const weekday = weekdays.findIndex(day => new RegExp(`(^|[\\s،])${day}(?=$|[\\s،])`).test(weekdayText));
    if (weekday >= 0 && !explicit) {
        const current = new Date(`${today}T12:00:00Z`).getUTCDay();
        plan.date = shiftDay(today, (weekday - current + 7) % 7 || 7);
    }
    const clock = command.match(/ساعت\s+(\d{1,2})(?::(\d{1,2})|\s+و\s+(نیم|ربع|\d{1,2})(?:\s+دقیقه)?)?/);
    if (clock || (plan.ambiguousTime && /عصر|صبح|ظهر|شب|بامداد/.test(command))) {
        let hour = Number(clock?.[1] ?? plan.ambiguousTime.split(":")[0]);
        const minute = clock ? clock[2] ?? (clock[3] === "نیم" ? "30" : clock[3] === "ربع" ? "15" : clock[3] ?? "00") : plan.ambiguousTime.split(":")[1];
        const period = /عصر|صبح|ظهر|شب|بامداد/.test(command);
        if (/عصر|ظهر|شب/.test(command) && hour < 12)
            hour += 12;
        if (/صبح|بامداد|شب/.test(command) && hour === 12)
            hour = 0;
        plan.time = `${String(hour).padStart(2, "0")}:${minute.padStart(2, "0")}`;
        plan.ambiguousTime = null;
        if (!period && hour >= 1 && hour <= 12 && !clock?.[1].startsWith("0")) {
            plan.ambiguousTime = plan.time;
            plan.time = "";
        }
    }
    else if (/عصر|صبح|شب/.test(command) && !previous)
        plan.time = "";
    const duration = text.match(/(?:به مدت|مدت|طول جلسه)\s*(\d+)\s*(دقیقه|ساعت)/);
    if (duration)
        plan.durationMinutes = Number(duration[1]) * (duration[2] === "ساعت" ? 60 : 1);
    if (/هر هفته|هفتگی/.test(text))
        plan.recurrence = "WEEKLY";
    else if (/هر روز|روزانه/.test(text))
        plan.recurrence = "DAILY";
    if (/بدون تکرار/.test(text))
        plan.recurrence = "NONE";
    const occurrences = text.match(/(\d+)\s*نوبت/);
    if (occurrences)
        plan.occurrenceCount = Number(occurrences[1]);
    const offsets = [...text.matchAll(/(\d+)\s*(روز|ساعت|دقیقه)\s*قبل/g)].map(m => Number(m[1]) * (m[2] === "روز" ? 1440 : m[2] === "ساعت" ? 60 : 1));
    if (offsets.length)
        plan.reminderOffsets = [...new Set(/هم|اضافه/.test(text) ? [...plan.reminderOffsets, ...offsets] : offsets)].sort((a, b) => b - a);
    else if (/یادم|یادآور|یادآوری/.test(text) && !previous) {
        plan.reminderOffsets = context.offsets ?? [1440, 180, 60];
        plan.defaults.push("یادآوری‌ها از تنظیمات پیش‌فرض");
    }
    if (/بدون یادآوری/.test(text)) {
        plan.reminderOffsets = [];
        plan.channels = [];
    }
    if (/آلارم|الارم/.test(text) && !/بدون آلارم|بدون الارم/.test(text))
        plan.channels = [...new Set([...plan.channels, "ALARM"])];
    if (/اعلان گوشی/.test(text))
        plan.channels = [...new Set([...plan.channels, "NATIVE"])];
    if (/پوش|push/i.test(text))
        plan.channels = [...new Set([...plan.channels, "PUSH"])];
    if (/بدون آلارم|بدون الارم/.test(text))
        plan.channels = plan.channels.filter(c => c !== "ALARM");
    if (/هشدار فوری|تشدید/.test(text))
        plan.escalation = true;
    const repeats = text.match(/(\d+)\s*بار/), interval = text.match(/هر\s*(\d+)\s*دقیقه/);
    if (repeats)
        plan.repeatCount = Number(repeats[1]);
    if (interval)
        plan.repeatMinutes = Number(interval[1]);
    if (!previous || /عنوان|تیتر/.test(command)) {
        plan.title = extractPersianTitle(message);
    }
    let candidates = [];
    if (plan.operation !== "CREATE" && !plan.targetId) {
        candidates = (context.items ?? []).filter(i => i.id && (original.includes(i.title) || (plan.title.length > 2 && i.title.includes(plan.title))));
        if (candidates.length === 1) {
            const item = candidates[0];
            plan.targetId = item.id;
            plan.targetUpdatedAt = item.updatedAt ?? null;
            plan.title = item.title;
            plan.entity = item.entity ?? "TASK";
            if (item.dueAt || item.startsAt) {
                const parts = dateParts(new Date((item.dueAt || item.startsAt)), timezone);
                if (!plan.date)
                    plan.date = parts.date;
                if (!plan.time && !/عصر|صبح|شب/.test(command))
                    plan.time = parts.time;
            }
            if (!/شخصی|شرکت|کاری/.test(text) && (item.category === "PERSONAL" || item.category === "WORK"))
                plan.category = item.category;
            if (!/فوری|مهم|عادی/.test(text) && (item.priority === "NORMAL" || item.priority === "IMPORTANT" || item.priority === "URGENT"))
                plan.priority = item.priority;
            if (item.alertPolicy) {
                try {
                    const policy = JSON.parse(item.alertPolicy);
                    if (!/یادم|یادآور|یادآوری|اعلان|آلارم|الارم/.test(text)) {
                        plan.reminderOffsets = policy.reminderOffsets ?? [];
                        plan.channels = policy.channels ?? ["IN_APP"];
                    }
                    plan.escalation = policy.escalation ?? false;
                    plan.repeatCount = policy.repeatCount ?? 1;
                    plan.repeatMinutes = policy.repeatMinutes ?? 15;
                    plan.quietStart = policy.quietStart ?? plan.quietStart;
                    plan.quietEnd = policy.quietEnd ?? plan.quietEnd;
                }
                catch { }
            }
            if (!plan.durationMinutes && item.startsAt && item.endsAt)
                plan.durationMinutes = (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 60000;
        }
    }
    normalizePlanForReview(plan, context.items);
    const checked = inspectPlan(plan, now, context.items);
    if (/همچنین|(?:کار|جلسه) دوم|\n/.test(message) || (message.match(/بساز|ثبت کن|دارم|تکمیل کن|حذف کن|انجام شد/g)?.length ?? 0) > 1)
        checked.questions.push("چند درخواست دیده شد؛ هر مورد را جداگانه بررسی و تأیید کنیم.");
    if (/پیامک|تماس/.test(message))
        checked.warnings.push("تماس و پیامک واقعی غیرفعال‌اند و در این پیشنهاد اجرا نمی‌شوند.");
    if (explicit && !plan.date)
        checked.questions.push("تاریخ شمسی معتبر نیست.");
    return { plan, ...checked, candidates, reply: checked.questions[0] ?? "جزئیات را بررسی کن؛ فقط پس از تأیید اجرا می‌کنم." };
}

return {planPersian,planInstant,inspectPlan,dateParts,planOccurrences,plannedReminderTimes,normalizePlanForReview,approvalSummary};})();
