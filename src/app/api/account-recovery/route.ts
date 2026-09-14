import { recoveryConfiguration } from "@/lib/recovery-policy";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ available: Boolean(recoveryConfiguration(process.env)) }, { headers: { "Cache-Control": "no-store" } });
}
