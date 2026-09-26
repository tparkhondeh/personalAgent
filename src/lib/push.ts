import "server-only";
import { createHash, randomUUID } from "node:crypto";
import webPush from "web-push";
import { readWebPushConfig } from "@/lib/push-config";
import { isSupportedPushEndpoint } from "@/lib/push-endpoint";
import { safePushPath } from "@/lib/push-navigation";

export function configureWebPush() {
  const config = readWebPushConfig();
  if (!config) return false;
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

export async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string; userId: string }, payload: { title: string; body: string; url?: string; tag?: string; urgent?: boolean }) {
  if (!isSupportedPushEndpoint(subscription.endpoint)) return { sent: false, reason: "UNSUPPORTED_PUSH_ENDPOINT" };
  if (!configureWebPush()) return { sent: false, reason: "VAPID_NOT_CONFIGURED" };
  // Delivery can race logout, expiry or account switching. Private details belong
  // only in the authenticated notification center, never in a queued Web Push.
  const identifier = typeof payload.tag === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.tag) ? payload.tag : randomUUID();
  const tag = `tia-${createHash("sha256").update(JSON.stringify([subscription.userId, identifier])).digest("hex")}`;
  const publicPayload = { title: "tia", body: "یادآوری تازه‌ای داری؛ برای مشاهده وارد برنامه شو.", url: safePushPath(payload.url), userId: subscription.userId, tag, urgent: Boolean(payload.urgent) };
  await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(publicPayload), { timeout: 10000 });
  return { sent: true };
}
