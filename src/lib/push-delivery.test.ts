import { beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: send } }));
vi.mock("@/lib/push-config", () => ({ readWebPushConfig: () => ({ subject: "mailto:test@example.invalid", publicKey: "synthetic-public", privateKey: "synthetic-private" }) }));
import { sendWebPush } from "./push";
beforeEach(() => vi.clearAllMocks());
describe("push destinations cannot become arbitrary server-side requests", () => {
  it.each(["https://127.0.0.1/internal", "https://[::1]/", "https://169.254.169.254/metadata", "https://private.example/push", "https://fcm.googleapis.com.evil.example/send", "http://fcm.googleapis.com/send", "https://fcm.googleapis.com:8443/send", "https://user:password@fcm.googleapis.com/send"])("blocks existing unsafe destination %s", async endpoint => {
    const result = await sendWebPush({ endpoint, p256dh: "test", auth: "test" }, { title: "آزمون", body: "ساختگی" });
    expect(result.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["https://fcm.googleapis.com/fcm/send/synthetic", "https://updates.push.services.mozilla.com/wpush/v2/synthetic", "https://web.push.apple.com/synthetic", "https://bn1.notify.windows.com/synthetic"])("allows documented provider %s through the mocked sender only", async endpoint => {
    expect((await sendWebPush({ endpoint, p256dh: "test", auth: "test" }, { title: "آزمون", body: "ساختگی" })).sent).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });
});
