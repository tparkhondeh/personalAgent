import { db } from "@/lib/db";
import { sendWebPush } from "@/lib/push";
import type { Prisma } from "@/generated/prisma/client";

const uncertainPush = "PUSH_DELIVERY_UNCERTAIN";
function activeOwner(userId: string): Prisma.ReminderWhereInput {
  return { userId, OR: [
    { taskId: { not: null }, meetingId: null, task: { is: { userId, status: { in: ["TODO", "IN_PROGRESS"] } } } },
    { taskId: null, meetingId: { not: null }, meeting: { is: { userId, status: "SCHEDULED" } } },
  ] };
}

// The marker is terminal to future workers. Only the invocation that committed it may send/settle.
async function pendingExternal(id: string, userId: string, settlement?: Prisma.ReminderUpdateManyMutationInput) {
  return db.$transaction(async tx => {
    const marker = { id, userId, status: "PARTIAL", lastError: uncertainPush };
    const current = await tx.reminder.findFirst({ where: { ...marker, ...activeOwner(userId) }, include: { user: { include: { pushSubscriptions: true } } } });
    if (!current) {
      await tx.reminder.updateMany({ where: marker, data: { status: "CANCELLED" } });
      return null;
    }
    if (settlement) await tx.reminder.updateMany({ where: marker, data: settlement });
    return current;
  });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const due = await db.reminder.findMany({ where: { status: "PENDING", scheduledFor: { lte: new Date() } }, select: { id: true, userId: true }, take: 100, orderBy: { scheduledFor: "asc" } });
  // Old claims have no reliable claim time or delivery receipt. Never manufacture a retry.
  const legacyProcessing = await db.reminder.count({ where: { status: "PROCESSING" } });
  let sent = 0; let failed = 0;
  for (const reminder of due) {
    try {
      const delivery = await db.$transaction(async tx => {
        const where = { id: reminder.id, userId: reminder.userId, status: "PENDING", scheduledFor: { lte: new Date() } };
        const current = await tx.reminder.findFirst({ where, include: { task: true, meeting: true, user: { include: { pushSubscriptions: true } } } });
        if (!current) return null;
        const external = current.channel === "PUSH" && current.user.pushSubscriptions.length > 0;
        const status = current.channel === "PUSH" ? "PARTIAL" : "SENT";
        const claimed = await tx.reminder.updateMany({ where: { ...where, ...activeOwner(current.userId) }, data: { status, sentAt: status === "SENT" ? new Date() : null, lastError: external ? uncertainPush : status === "PARTIAL" ? "PUSH_NOT_SENT_NO_SUBSCRIPTIONS" : null } });
        if (!claimed.count) {
          await tx.reminder.updateMany({ where, data: { status: "CANCELLED" } });
          return null;
        }
        const title = current.task?.title ?? current.meeting?.title ?? "یادآوری tia";
        const id = `reminder:${current.id}`;
        await tx.notification.upsert({ where: { id }, update: {}, create: { id, userId: current.userId, title: "یادآوری برنامه", body: title, type: "REMINDER" } });
        return { title, external, status };
      });
      if (!delivery) continue;
      if (!delivery.external) { if (delivery.status === "SENT") sent++; else failed++; continue; }
      const current = await pendingExternal(reminder.id, reminder.userId);
      if (!current) continue;
      const results = await Promise.allSettled(current.user.pushSubscriptions.map(subscription => sendWebPush(subscription, { title: "tia", body: delivery.title, url: "/", tag: reminder.id })));
      const targets = results.map((result, index) => ({ id: current.user.pushSubscriptions[index].id, status: result.status === "rejected" ? "DELIVERY_UNCERTAIN" : result.value.sent ? "SENT" : "NOT_SENT" }));
      const successful = targets.length > 0 && targets.every(target => target.status === "SENT");
      const settled = await pendingExternal(reminder.id, reminder.userId, { status: successful ? "SENT" : "PARTIAL", sentAt: successful ? new Date() : null, lastError: JSON.stringify({ push: targets, ...(targets.length ? {} : { reason: "NO_SUBSCRIPTIONS" }) }) });
      if (settled) { if (successful) sent++; else failed++; }
    } catch {
      // A pre-commit failure rolls back to PENDING. A lost commit/egress acknowledgement
      // leaves PARTIAL + uncertainty intact; neither case permits an unrecorded resend.
      failed++;
    }
  }
  const uncertain = await db.reminder.count({ where: { status: "PARTIAL", lastError: { contains: "DELIVERY_UNCERTAIN" } } });
  return Response.json({ processed: sent + failed, sent, failed, uncertain, legacyProcessing });
}
