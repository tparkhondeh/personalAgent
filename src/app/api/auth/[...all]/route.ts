import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { validAgentOrigin } from "@/lib/agent-origin";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  // New clients bind logout to the displayed account. A late request must not
  // revoke a different account's session after another tab signs in.
  if (new URL(request.url).pathname.replace(/\/$/, "").endsWith("/sign-out")) {
    const expectedUser = request.headers.get("x-tia-user-id");
    if (expectedUser !== null) {
      if (!validAgentOrigin(request)) return Response.json({ error: "مبدأ درخواست مجاز نیست" }, { status: 403 });
      const session = await auth.api.getSession({ headers: request.headers });
      if (session && session.user.id !== expectedUser) return Response.json({ error: "حساب تغییر کرده است؛ صفحه را تازه کنید" }, { status: 409 });
    }
  }
  return handlers.POST(request);
}
