import "server-only";
import { auth } from "@/lib/auth";

export async function requireApiSession(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  return session;
}

export function jsonError(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}
