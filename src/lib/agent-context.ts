import { parseStoredReminderOffsets } from "./reminder-offsets";

type ContextTask = { title: string; category: string; priority: string; dueAt: Date | null };
type ContextMeeting = { title: string; startsAt: Date; endsAt: Date };
type ContextPreference = { workdayStartsAt: string; workdayEndsAt: string; workingDays: string; defaultReminderMins: number; defaultReminderOffsets?: string; quietHoursStartsAt: string; quietHoursEndsAt: string; planningProfile: string | null } | null;

export function formatAgentContext({ preference, tasks, meetings }: { preference: ContextPreference; tasks: ContextTask[]; meetings: ContextMeeting[] }) {
  const planning = preference ? {
    workday: `${preference.workdayStartsAt}-${preference.workdayEndsAt}`,
    workingDays: preference.workingDays.split(",").filter(Boolean),
    defaultReminderMinutes: parseStoredReminderOffsets(preference.defaultReminderOffsets, preference.defaultReminderMins),
    quietHours: `${preference.quietHoursStartsAt}-${preference.quietHoursEndsAt}`,
    planningProfile: preference.planningProfile || "BALANCED",
  } : null;
  return JSON.stringify({
    planning,
    openTasks: tasks.map((task) => ({ title: task.title, category: task.category, priority: task.priority, dueAt: task.dueAt?.toISOString() || null })),
    upcomingMeetings: meetings.map((meeting) => ({ title: meeting.title, startsAt: meeting.startsAt.toISOString(), endsAt: meeting.endsAt.toISOString() })),
  });
}
