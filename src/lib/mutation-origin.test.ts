import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => vi.fn(async () => null));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api", () => ({ requireApiSession: session, jsonError: (error: string, status: number) => Response.json({ error }, { status }) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/rate-limit", () => ({ guardUserRateLimit: () => null }));
vi.mock("@/lib/escalation-service", () => ({ listNativeEscalationAlarms: vi.fn(), syncUserEscalations: vi.fn() }));
import * as tasks from "@/app/api/tasks/route";
import * as task from "@/app/api/tasks/[id]/route";
import * as meetings from "@/app/api/meetings/route";
import * as meeting from "@/app/api/meetings/[id]/route";
import * as preferences from "@/app/api/preferences/route";
import * as notifications from "@/app/api/notifications/route";
import * as escalations from "@/app/api/escalations/route";
import * as push from "@/app/api/push-subscriptions/route";

const routes = [
  ["POST tasks", tasks.POST], ["PATCH task", task.PATCH], ["DELETE task", task.DELETE],
  ["POST meetings", meetings.POST], ["PATCH meeting", meeting.PATCH], ["DELETE meeting", meeting.DELETE],
  ["PUT preferences", preferences.PUT], ["PATCH notifications", notifications.PATCH],
  ["POST escalations", escalations.POST], ["PATCH escalations", escalations.PATCH], ["POST push", push.POST], ["DELETE push", push.DELETE],
] as const;
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("BETTER_AUTH_URL", "https://personalagent.wealthos.ir:8443"); });
afterEach(() => vi.unstubAllEnvs());

describe.each(routes)("%s request origin", (name, handler) => {
  it.each([null, "null", "https://untrusted.example", "https://personalagent.wealthos.ir", "https://other.wealthos.ir:8443"])("rejects %s before session/data access", async origin => {
    const headers = new Headers({ "content-type": "text/plain" });
    if (origin !== null) headers.set("origin", origin);
    const response = await handler(new Request("http://localhost:3001/api/test", { method: name.split(" ")[0], headers, body: "{}" }), { params: Promise.resolve({ id: "synthetic-id" }) });
    expect(response.status).toBe(403);
    expect(session).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:3001", "https://personalagent.wealthos.ir:8443"])("still requires login for trusted origin %s", async origin => {
    const response = await handler(new Request("http://localhost:3001/api/test", { method: name.split(" ")[0], headers: { origin } }), { params: Promise.resolve({ id: "synthetic-id" }) });
    expect(response.status).toBe(401);
    expect(session).toHaveBeenCalledOnce();
  });
});
