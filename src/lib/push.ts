import "server-only";
import webPush from "web-push";

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth: string }, payload: { title: string; body: string; url?: string; tag?: string; urgent?: boolean }) {
  if (!configureWebPush()) return { sent: false, reason: "VAPID_NOT_CONFIGURED" };
  await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload));
  return { sent: true };
}
