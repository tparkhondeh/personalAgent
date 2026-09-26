import { beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: send } }));
vi.mock("@/lib/push-config", () => ({ readWebPushConfig: () => ({ subject: "mailto:test@example.invalid", publicKey: "synthetic-public", privateKey: "synthetic-private" }) }));
import { sendWebPush } from "./push";
beforeEach(() => vi.clearAllMocks());
describe("push destinations cannot become arbitrary server-side requests", () => {
  it.each(["https://127.0.0.1/internal", "https://[::1]/", "https://169.254.169.254/metadata", "https://private.example/push", "https://fcm.googleapis.com.evil.example/send", "http://fcm.googleapis.com/send", "https://fcm.googleapis.com:8443/send", "https://user:password@fcm.googleapis.com/send"])("blocks existing unsafe destination %s", async endpoint => {
    const result = await sendWebPush({ endpoint, p256dh: "test", auth: "test", userId: "owner" }, { title: "آزمون", body: "ساختگی" });
    expect(result.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it.each(["https://fcm.googleapis.com/fcm/send/synthetic", "https://updates.push.services.mozilla.com/wpush/v2/synthetic", "https://web.push.apple.com/synthetic", "https://bn1.notify.windows.com/synthetic"])("allows documented provider %s through the mocked sender only", async endpoint => {
    expect((await sendWebPush({ endpoint, p256dh: "test", auth: "test", userId: "owner" }, { title: "آزمون", body: "ساختگی" })).sent).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });
});

it("redacts private text and preserves distinct opaque urgent/normal tags and approved item links", async () => {
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", p256dh: "test", auth: "test", userId: "owner" };
  await sendWebPush(subscription, { title: "PRIVATE TITLE", body: "PRIVATE BODY", url: "/?view=tasks&taskId=opaque-id", tag: "private-first", urgent: true });
  await sendWebPush(subscription, { title: "PRIVATE TITLE", body: "PRIVATE BODY", url: "https://evil.example/private", tag: "private-second" });
  const calls = send.mock.calls as unknown as [unknown, string][];
  const [urgent, normal] = calls.map(call => JSON.parse(call[1]));
  expect(JSON.stringify(calls)).not.toMatch(/PRIVATE|private-first|private-second|evil\.example/);
  expect(urgent).toMatchObject({ url: "/?view=tasks&taskId=opaque-id", userId: "owner", urgent: true });
  expect(normal).toMatchObject({ url: "/", urgent: false });
  expect(urgent.tag).toMatch(/^tia-[a-f0-9]{64}$/); expect(normal.tag).not.toBe(urgent.tag);
});

it("deduplicates the same ID, but invalid/private/oversized tags cannot merge unrelated pushes", async () => {
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", p256dh: "test", auth: "test", userId: "owner" };
  for (const tag of ["opaque-first", "opaque-first", "private title", "private title", "x".repeat(1000), "x".repeat(1000)]) {
    await sendWebPush(subscription, { title: "PRIVATE", body: "PRIVATE", tag });
  }
  const tags = (send.mock.calls as unknown as [unknown, string][]).map(call => JSON.parse(call[1]).tag);
  expect(tags[0]).toBe(tags[1]); expect(new Set(tags.slice(2)).size).toBe(4);
  expect(tags.every(tag => /^tia-[a-f0-9]{64}$/.test(tag))).toBe(true);
});
