import { db } from "@/lib/db";
import { sendWebPush } from "@/lib/push";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const due = await db.reminder.findMany({ where: { status: "PENDING", scheduledFor: { lte: new Date() } }, include: { task: true, meeting: true, user: { include: { pushSubscriptions: true } } }, take: 100, orderBy: { scheduledFor: "asc" } });
  let sent = 0; let failed = 0;
  for (const reminder of due) {
    const claimed = await db.reminder.updateMany({ where: { id: reminder.id, status: "PENDING" }, data: { status: "PROCESSING" } });
    if (claimed.count === 0) continue;
    const title = reminder.task?.title ?? reminder.meeting?.title ?? "یادآوری همراه";
    try {
      await db.notification.create({ data: { userId: reminder.userId, title: "زمان انجام کار رسیده", body: title, type: "REMINDER" } });
      const results = await Promise.allSettled(reminder.user.pushSubscriptions.map((subscription) => sendWebPush(subscription, { title: "همراه", body: title, url: "/", tag: reminder.id })));
      const rejected = results.filter((result) => result.status === "rejected");
      await db.reminder.update({ where: { id: reminder.id }, data: { status: rejected.length ? "PARTIAL" : "SENT", sentAt: new Date(), lastError: rejected.length ? `${rejected.length} push delivery failed` : null } });
      sent++;
    } catch (error) {
      await db.reminder.update({ where: { id: reminder.id }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" } });
      failed++;
    }
  }
  return Response.json({ processed: sent + failed, sent, failed });
}
