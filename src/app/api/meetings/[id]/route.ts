import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { meetingUpdateSchema } from "@/lib/validation";
import { reminderIdempotencyKey } from "@/lib/reminders";
import { guardUserRateLimit } from "@/lib/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  const existing = await db.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return jsonError("جلسه پیدا نشد", 404);
  const preference = await db.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true } });
  const parsed = meetingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات جلسه معتبر نیست", 422, parsed.error.flatten());

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startsAt;
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : existing.endsAt;
  if (endsAt <= startsAt) return jsonError("زمان پایان باید بعد از شروع باشد", 422);

  const meeting = await db.$transaction(async (tx) => {
    const updated = await tx.meeting.update({
      where: { id },
      data: {
        ...parsed.data,
        attendees: parsed.data.attendees ? JSON.stringify(parsed.data.attendees) : undefined,
        startsAt,
        endsAt,
      },
    });
    await tx.calendarEvent.upsert({
      where: { meetingId: id },
      update: { title: updated.title, startsAt, endsAt },
      create: { title: updated.title, startsAt, endsAt, meetingId: id },
    });
    await tx.reminder.deleteMany({ where: { meetingId: id } });
    const scheduledFor = new Date(startsAt.getTime() - (preference?.defaultReminderMins ?? 15) * 60_000);
    await tx.reminder.create({ data: { userId: session.user.id, meetingId: id, scheduledFor, channel: "PUSH", idempotencyKey: reminderIdempotencyKey(session.user.id, id, scheduledFor, "PUSH") } });
    await tx.auditLog.create({ data: { userId: session.user.id, action: "MEETING_UPDATED", entityType: "Meeting", entityId: id, input: JSON.stringify(parsed.data) } });
    return updated;
  });
  return Response.json({ data: meeting });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  const existing = await db.meeting.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return jsonError("جلسه پیدا نشد", 404);
  await db.$transaction(async (tx) => {
    await tx.auditLog.create({ data: { userId: session.user.id, action: "MEETING_DELETED", entityType: "Meeting", entityId: id, input: JSON.stringify({ title: existing.title }) } });
    await tx.meeting.delete({ where: { id } });
  });
  return new Response(null, { status: 204 });
}
