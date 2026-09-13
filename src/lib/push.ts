import "server-only";
import webPush from "web-push";
import { readWebPushConfig } from "@/lib/push-config";
import { isSupportedPushEndpoint } from "@/lib/push-endpoint";

export function configureWebPush() {
  const config = readWebPushConfig();
  if (!config) return false;
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return true;
}

export async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: { title: string; body: string; url?: string; tag?: string; urgent?: boolean }) {
  if (!isSupportedPushEndpoint(subscription.endpoint)) return { sent: false, reason: "UNSUPPORTED_PUSH_ENDPOINT" };
  if (!configureWebPush()) return { sent: false, reason: "VAPID_NOT_CONFIGURED" };
  await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), { timeout: 10000 });
  return { sent: true };
}
