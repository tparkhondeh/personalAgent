import { db } from "@/lib/db";
import { jsonError, requireApiSession } from "@/lib/api";
import { validAgentOrigin } from "@/lib/agent-origin";
import { meetingUpdateSchema } from "@/lib/validation";
import { reminderIdempotencyKey } from "@/lib/reminders";
import { guardUserRateLimit } from "@/lib/rate-limit";
import { parseStoredReminderOffsets } from "@/lib/reminder-offsets";
import { storedReminderSchedule } from "@/lib/stored-reminder-schedule";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  const parsed = meetingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("اطلاعات جلسه معتبر نیست", 422, parsed.error.flatten());

  return db.$transaction(async (tx) => {
    const owned = { id, userId: session.user.id };
    const existing = await tx.meeting.findFirst({ where: owned });
    if (!existing) return jsonError("جلسه پیدا نشد", 404);
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startsAt;
    const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : existing.endsAt;
    if (endsAt <= startsAt) return jsonError("زمان پایان باید بعد از شروع باشد", 422);
    const updated = await tx.meeting.update({
      where: owned,
      data: {
        ...parsed.data,
        attendees: parsed.data.attendees ? JSON.stringify(parsed.data.attendees) : undefined,
        startsAt: parsed.data.startsAt ? startsAt : undefined,
        endsAt: parsed.data.endsAt ? endsAt : undefined,
      },
    });
    await tx.calendarEvent.upsert({
      where: { meetingId: id },
      update: { title: updated.title, startsAt: updated.startsAt, endsAt: updated.endsAt },
      create: { title: updated.title, startsAt: updated.startsAt, endsAt: updated.endsAt, meetingId: id },
    });
    const meta = { cancelledDeviceReminderIds: [] as string[], cancelledEscalationAttemptIds: [] as string[] };
    const active = updated.status === "SCHEDULED";
    if (existing.startsAt.getTime() !== updated.startsAt.getTime() || existing.status !== updated.status || !active) {
      const previous = await tx.reminder.findMany({ where: { meetingId: id, userId: session.user.id }, select: { id: true, channel: true, status: true, scheduledFor: true } });
      const preference = active ? await tx.userPreference.findUnique({ where: { userId: session.user.id }, select: { defaultReminderMins: true, defaultReminderOffsets: true } }) : null;
      const offsets = parseStoredReminderOffsets(preference?.defaultReminderOffsets, preference?.defaultReminderMins);
      const now = new Date();
      const schedule = active ? storedReminderSchedule(updated.startsAt, updated.alertPolicy, offsets).filter(row => row.scheduledFor > now) : [];
      const sameSlot = (a: { channel: string; scheduledFor: Date }, b: { channel: string; scheduledFor: Date }) => a.channel === b.channel && a.scheduledFor.getTime() === b.scheduledFor.getTime();
      const cancelled = previous.filter(row => ["PENDING", "DEVICE_PENDING", "PROCESSING"].includes(row.status) && !schedule.some(slot => sameSlot(row, slot)));
      // Repeated completion must still let a device cancel after an uncertain first response.
      meta.cancelledDeviceReminderIds = (active ? cancelled : previous).filter(row => ["ALARM", "NATIVE"].includes(row.channel)).map(row => row.id);
      if (cancelled.length) await tx.reminder.updateMany({ where: { id: { in: cancelled.map(row => row.id) }, userId: session.user.id, meetingId: id, status: { in: ["PENDING", "DEVICE_PENDING", "PROCESSING"] } }, data: { status: "CANCELLED" } });
      const additions = schedule.filter(slot => !previous.some(row => row.status !== "CANCELLED" && sameSlot(row, slot)));
      if (additions.length) await tx.reminder.createMany({ data: additions.map(row => ({ ...row, userId: session.user.id, meetingId: id, idempotencyKey: `${reminderIdempotencyKey(session.user.id, id, row.scheduledFor, row.channel)}:${updated.updatedAt.toISOString()}` })) });
    }
    // Retry responses must retain owned cancellation IDs even when the schedule is now unchanged.
    const cancelledDevices = await tx.reminder.findMany({ where: { meetingId: id, userId: session.user.id, status: "CANCELLED", channel: { in: ["ALARM", "NATIVE"] } }, select: { id: true } });
    meta.cancelledDeviceReminderIds = [...new Set([...meta.cancelledDeviceReminderIds, ...cancelledDevices.map(row => row.id)])];
    await tx.auditLog.create({ data: { userId: session.user.id, action: "MEETING_UPDATED", entityType: "Meeting", entityId: id, input: JSON.stringify(parsed.data) } });
    return Response.json({ data: updated, meta });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validAgentOrigin(request)) return jsonError("مبدأ درخواست مجاز نیست", 403);
  const session = await requireApiSession(request.headers);
  if (!session) return jsonError("ابتدا وارد حساب شوید", 401);
  const limited = guardUserRateLimit(session.user.id, "mutations", { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  const { id } = await params;
  return db.$transaction(async (tx) => {
    const owned = { id, userId: session.user.id };
    const existing = await tx.meeting.findFirst({ where: owned });
    if (!existing) {
      const receipt = await tx.auditLog.findFirst({ where: { userId: session.user.id, entityId: id, entityType: "Meeting", action: "MEETING_DELETED" }, orderBy: { createdAt: "desc" }, select: { result: true } });
      try {
        const saved = JSON.parse(receipt?.result ?? "null");
        const cancelledDeviceReminderIds = saved?.cancelledDeviceReminderIds, cancelledEscalationAttemptIds = saved?.cancelledEscalationAttemptIds;
        if ([cancelledDeviceReminderIds, cancelledEscalationAttemptIds].every(ids => Array.isArray(ids) && ids.every((value: unknown) => typeof value === "string"))) {
          return Response.json({ data: { id, deleted: true }, meta: { cancelledDeviceReminderIds, cancelledEscalationAttemptIds } });
        }
      } catch { /* Legacy receipts without valid cancellation metadata cannot be replayed. */ }
      return jsonError("جلسه پیدا نشد", 404);
    }
    const cancelledDeviceReminderIds = (await tx.reminder.findMany({ where: { meetingId: id, userId: session.user.id, channel: { in: ["ALARM", "NATIVE"] } }, select: { id: true } })).map(row => row.id);
    const meta = { cancelledDeviceReminderIds, cancelledEscalationAttemptIds: [] as string[] };
    await tx.auditLog.create({ data: { userId: session.user.id, action: "MEETING_DELETED", entityType: "Meeting", entityId: id, input: JSON.stringify({ title: existing.title }), result: JSON.stringify(meta) } });
    await tx.meeting.delete({ where: owned });
    return Response.json({ data: { id, deleted: true }, meta });
  });
}
