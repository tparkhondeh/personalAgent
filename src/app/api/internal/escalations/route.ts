import { db } from "@/lib/db";
import { syncUserEscalations } from "@/lib/escalation-service";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const overdue = await db.task.findMany({
    where: { priority: "URGENT", status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lte: new Date() } },
    select: { userId: true },
    distinct: ["userId"],
    take: 500,
  });
  const results = [];
  for (const { userId } of overdue) {
    const synced = await syncUserEscalations(userId);
    results.push({ userId, nativeAlarms: synced.alarms.length });
  }
  return Response.json({ processedUsers: results.length, results });
}
