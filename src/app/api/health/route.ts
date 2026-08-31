import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRawUnsafe("SELECT 1");
    return Response.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable" }, { status: 503 });
  }
}
