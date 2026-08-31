import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { meetingInputSchema } from "@/lib/validation";
import { reminderIdempotencyKey } from "@/lib/reminders";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const meetings = await db.meeting.findMany({ where: { userId: session.user.id }, orderBy: { startsAt: "asc" } });
  return Response.json({ data: meetings });
}

export async function POST(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const parsed = meetingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات جلسه معتبر نیست", 422, parsed.error.flatten());
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true } });
  const meeting = await db.$transaction(async (tx) => {
    const created = await tx.meeting.create({ data: { ...parsed.data, attendees: JSON.stringify(parsed.data.attendees), startsAt: new Date(parsed.data.startsAt), endsAt: new Date(parsed.data.endsAt), userId: session.user.id } });
    await tx.calendarEvent.create({ data: { title: created.title, startsAt: created.startsAt, endsAt: created.endsAt, meetingId: created.id } });
    const scheduledFor = new Date(created.startsAt.getTime() - (preference?.defaultReminderMins ?? 15) * 60_000);
    await tx.reminder.create({ data: { userId: session.user.id, meetingId: created.id, scheduledFor, channel: "PUSH", idempotencyKey: reminderIdempotencyKey(session.user.id, created.id, scheduledFor, "PUSH") } });
    await tx.auditLog.create({ data: { userId: session.user.id, action: "MEETING_CREATED", entityType: "Meeting", entityId: created.id, input: JSON.stringify({ title: created.title, startsAt: created.startsAt }) } });
    return created;
  });
  return Response.json({ data: meeting }, { status: 201 });
}
