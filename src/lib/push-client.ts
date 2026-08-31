export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export async function enablePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("مرورگر از اعلان پشتیبانی نمی‌کند");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("اجازه اعلان داده نشد");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    await registration.showNotification("همراه", { body: "اعلان‌های محلی روی این دستگاه فعال شد.", icon: "/icon.svg", tag: "hamrah-local-ready" });
    return { mode: "local" as const };
  }
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  const response = await fetch("/api/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
  if (!response.ok) throw new Error("ثبت اعلان انجام نشد؛ ابتدا وارد حساب شوید");
  return { mode: "push" as const, subscription };
}
