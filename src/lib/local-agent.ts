export type LocalAgentProposal = {
  kind: "CREATE_TASK" | "CREATE_MEETING" | "PLAN" | "NONE";
  needsApproval: boolean;
  title?: string;
  category?: "PERSONAL" | "WORK";
  priority?: "URGENT" | "IMPORTANT" | "NORMAL";
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
  reasoning?: string;
};

type ContextItem = { title: string; dueAt?: Date | null; startsAt?: Date | null };

const persianDigits = "۰۱۲۳۴۵۶۷۸۹";

function normalizeDigits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)));
}

function dateAtTehranTime(message: string, now: Date) {
  const normalized = normalizeDigits(message);
  const match = normalized.match(/ساعت\s*(\d{1,2})(?::(\d{1,2}))?/);
  const dayOffset = /پس[‌ ]?فردا/.test(message) ? 2 : /فردا/.test(message) ? 1 : 0;
  const target = new Date(now.getTime() + dayOffset * 86_400_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(target);
  const hour = Math.min(Number(match?.[1] ?? 9), 23);
  const minute = Math.min(Number(match?.[2] ?? 0), 59);
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:30`);
}

function cleanTitle(message: string, fallback: string) {
  const title = normalizeDigits(message)
    .replace(/(لطفاً|لطفا|میخوام|می‌خوام|برام|بذار|بساز|ثبت کن|یادآوری کن|جلسه|کار|امروز|فردا|پس[‌ ]?فردا)/g, " ")
    .replace(/ساعت\s*\d{1,2}(?::\d{1,2})?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return title || fallback;
}

export function createLocalAgentResponse(input: { message: string; now?: Date; tasks: ContextItem[]; meetings: ContextItem[] }) {
  const { message, tasks, meetings } = input;
  const now = input.now ?? new Date();
  const asksForSummary = /(خلاصه|برنامه امروز|چه کار|کارهای من|جلسات من)/.test(message);
  if (asksForSummary && !/(بساز|بذار|ثبت کن|یادآوری کن)/.test(message)) {
    const datedTasks = tasks.filter((task) => task.dueAt && task.dueAt >= now).length;
    const upcomingMeetings = meetings.filter((meeting) => meeting.startsAt && meeting.startsAt >= now).length;
    return {
      reply: `در برنامه فعلی ${tasks.length} کار باز و ${upcomingMeetings} جلسه پیش رو داری. ${datedTasks ? `${datedTasks} کار زمان مشخص دارد.` : "برای کارهای بدون زمان بهتر است یک موعد مشخص کنی."}`,
      proposal: { kind: "PLAN", needsApproval: false, reasoning: tasks.length ? "ابتدا کار فوری یا مهمی را که نزدیک‌ترین موعد را دارد انجام بده." : "برنامه باز فشرده‌ای نداری؛ زمان استراحت و مرور هفته را مشخص کن." } satisfies LocalAgentProposal,
    };
  }

  if (/(زمان آزاد|پیشنهاد بده|چه کنم|چی کار کنم)/.test(message)) {
    const nextTask = tasks.find((task) => task.dueAt && task.dueAt >= now) ?? tasks[0];
    return {
      reply: nextTask ? `برای زمان آزاد امروز، یک بازه کوتاه روی «${nextTask.title}» بگذار و بعد چند دقیقه استراحت کن.` : "برای زمان آزاد امروز، یک کار کوتاه مفید یا زمان استراحت آگاهانه در برنامه بگذار.",
      proposal: { kind: "PLAN", needsApproval: false, reasoning: nextTask ? `پیشنهاد من شروع با «${nextTask.title}» است.` : "برنامه باز فوری نداری؛ یک مرور کوتاه هفتگی یا استراحت انتخاب خوبی است." } satisfies LocalAgentProposal,
    };
  }

  const isMeeting = /جلسه|قرار/.test(message);
  const asksToCreate = /(بساز|بذار|ثبت کن|یادآوری کن|اضافه کن|دارم)/.test(message);
  if (isMeeting && asksToCreate) {
    const startsAt = dateAtTehranTime(message, now);
    return {
      reply: "پیشنهاد جلسه آماده است. زمان و عنوان را بررسی کن و فقط اگر درست بود تأییدش کن.",
      proposal: { kind: "CREATE_MEETING", needsApproval: true, title: cleanTitle(message, "جلسه جدید"), startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString() } satisfies LocalAgentProposal,
    };
  }

  if (asksToCreate || /کار/.test(message)) {
    const dueAt = dateAtTehranTime(message, now);
    return {
      reply: "پیشنهاد کار آماده است. پیش از ثبت، عنوان و زمان آن را بررسی کن.",
      proposal: { kind: "CREATE_TASK", needsApproval: true, title: cleanTitle(message, "کار جدید"), category: /(شرکت|کاری|تیم|فروش)/.test(message) ? "WORK" : "PERSONAL", priority: /فوری/.test(message) ? "URGENT" : /مهم/.test(message) ? "IMPORTANT" : "NORMAL", dueAt: dueAt.toISOString() } satisfies LocalAgentProposal,
    };
  }

  return { reply: "در حالت محلی می‌توانم برنامه را خلاصه کنم یا از جمله‌های ساده، کار و جلسه پیشنهادی بسازم. زمان و موضوع را واضح بگو.", proposal: { kind: "NONE", needsApproval: false } satisfies LocalAgentProposal };
}
