export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function withPushLock<T>(action: () => Promise<T>, required = false): Promise<T> {
  if (navigator.locks?.request) return await navigator.locks.request("tia-device-push", action);
  if (required) return Promise.reject(new Error("ثبت امن اعلان در این مرورگر در دسترس نیست؛ از اعلان داخل برنامه استفاده کن."));
  // Older browsers must still be able to revoke an existing subscription/log out.
  return action();
}

async function removeServerSubscription(subscription: PushSubscription, userId: string) {
  const response = await fetch("/api/push-subscriptions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...subscription.toJSON(), userId }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("لغو اعلان انجام نشد؛ حساب را تازه کن و خروج را دوباره بررسی کن.");
  return (await response.json()).revoked === true;
}

async function revokeSubscription(subscription: PushSubscription, userId: string) {
  await removeServerSubscription(subscription, userId);
  if (!await subscription.unsubscribe()) throw new Error("لغو اعلان این دستگاه تأیید نشد؛ دوباره تلاش کن.");
}

export async function logoutWithPushCleanup(userId: string, signOut: (options: { fetchOptions: { headers: Record<string, string> } }) => Promise<{ error?: unknown }>, skipWebPush = false) {
  return withPushLock(async () => {
    let pushRevoked = true;
    if (!skipWebPush && "serviceWorker" in navigator && "PushManager" in window) {
      try {
        // Do not register a new worker merely to sign out. Server ownership must
        // be confirmed before unsubscribing; a stale A tab must not revoke B.
        const registration = await navigator.serviceWorker.getRegistration("/");
        try {
          const subscription = await registration?.pushManager.getSubscription();
          if (subscription) {
            const revoked = await removeServerSubscription(subscription, userId);
            // Server revocation is sufficient even if the provider is unavailable.
            // Do not touch a binding retained by another account on this browser.
            if (revoked) await subscription.unsubscribe().catch(() => false);
          }
        } catch { pushRevoked = false; }
        // Still close this account's visible notifications on a server outage.
        const notifications = await registration?.getNotifications();
        notifications?.filter(notification => !notification.data?.userId || notification.data.userId === userId).forEach(notification => notification.close());
      } catch { pushRevoked = false; }
    }
    // Cleanup outages must not trap the user in a session. The worker independently
    // checks the current account, and even an in-flight payload has no private text.
    const result = await signOut({ fetchOptions: { headers: { "x-tia-user-id": userId } } });
    if (result.error) throw new Error("خروج تأیید نشد؛ وضعیت حساب را تازه کن و دوباره تلاش کن.");
    return { pushRevoked };
  });
}

export async function enablePushNotifications(expectedUserId?: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("این مرورگر از Push پشتیبانی نمی‌کند؛ اعلان‌های داخل برنامه همچنان در دسترس‌اند.");
  // An unanswered permission prompt must never hold the logout/device lock.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("اجازه اعلان داده نشد");
  return withPushLock(async () => {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const configuration = await fetch("/api/push-subscriptions", { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!configuration.ok) throw new Error("دریافت تنظیمات اعلان انجام نشد؛ اتصال و ورود به حساب را بررسی کنید");
  const { publicKey: key, userId } = await configuration.json() as { publicKey: string | null; userId: string };
  if (!userId || (expectedUserId && expectedUserId !== userId)) throw new Error("حساب تغییر کرده است؛ صفحه را تازه کن.");
  if (!key) {
    await registration.showNotification("همراه", { body: "اعلان‌های محلی روی این دستگاه فعال شد.", icon: "/icon.svg", tag: "hamrah-local-ready" });
    return { mode: "local" as const };
  }
  const existing = await registration.pushManager.getSubscription();
  // Rotate this browser's binding, including one left by an earlier account.
  // The server only removes a row owned by userId and never transfers ownership.
  if (existing) await revokeSubscription(existing, userId);
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  try {
    const response = await fetch("/api/push-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...subscription.toJSON(), userId }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("ثبت اعلان انجام نشد؛ ابتدا حساب را تازه کنید");
  } catch (error) {
    // An uncertain response is not a reason to rebind or replay the POST.
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return { mode: "push" as const, subscription };
  }, true);
}
