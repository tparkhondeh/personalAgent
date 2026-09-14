import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { validAgentOrigin } from "@/lib/agent-origin";
import { meetingInputSchema } from "@/lib/validation";
import { reminderIdempotencyKey } from "@/lib/reminders";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { buildReminderSchedule, parseStoredReminderOffsets } from "@/lib/reminder-offsets";
import { createExactlyOnce, createFailure, createRequestIdentity } from "@/lib/create-request";

export async function GET(request: Request) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const meetings = await db.meeting.findMany({ where: { userId: session.user.id, status: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" } });
  return Response.json({ data: meetings });
}

export async function POST(request: Request) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = meetingInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات جلسه معتبر نیست", 422, parsed.error.flatten());
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true, defaultReminderOffsets: true } });
  const reminderOffsets = parseStoredReminderOffsets(preference?.defaultReminderOffsets, preference?.defaultReminderMins);
  try {
  const identity = createRequestIdentity(request.headers.get("idempotency-key"), session.user.id, "Meeting", parsed.data);
  const meeting = await createExactlyOnce(db, identity, async (tx) => {
    const created = await tx.meeting.create({ data: { ...parsed.data, attendees: JSON.stringify(parsed.data.attendees), startsAt: new Date(parsed.data.startsAt), endsAt: new Date(parsed.data.endsAt), userId: session.user.id } });
    await tx.calendarEvent.create({ data: { title: created.title, startsAt: created.startsAt, endsAt: created.endsAt, meetingId: created.id } });
    await tx.reminder.createMany({ data: buildReminderSchedule(created.startsAt, reminderOffsets).map(({ scheduledFor }) => ({ userId: session.user.id, meetingId: created.id, scheduledFor, channel: "PUSH", idempotencyKey: reminderIdempotencyKey(session.user.id, created.id, scheduledFor, "PUSH") })) });
    await tx.auditLog.create({ data: { userId: session.user.id, action: "MEETING_CREATED", entityType: "Meeting", entityId: created.id, input: JSON.stringify({ title: created.title, startsAt: created.startsAt }) } });
    return created;
  }, (tx, id) => tx.meeting.findFirst({ where: { id, userId: session.user.id } }));
  return Response.json({ data: meeting, meta: { remindersScheduled: reminderOffsets.length } }, { status: 201 });
  } catch (error) { return createFailure(error); }
}
