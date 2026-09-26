import type { NativeAlarmPrivacyStatus } from "./native-alarm-session";

export const NATIVE_LOGOUT_WAIT_MS = 5000;
export const NATIVE_CLEANUP_WARNING = "پاک‌سازی یادآوری‌های حساب قبلی هنوز تأیید نشده؛ ممکن است همچنان نمایش داده شوند. دوباره تلاش کن؛ یادآوری تازه فعلاً تنظیم نمی‌شود.";

function bounded<T>(operation: () => Promise<T>): Promise<{ settled: true; value: T } | { settled: false }> {
  return new Promise(resolve => {
    let finished = false;
    const finish = (result: { settled: true; value: T } | { settled: false }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ settled: false }), NATIVE_LOGOUT_WAIT_MS);
    // Invoke immediately: native fencing must precede the first asynchronous wait.
    try { operation().then(value => finish({ settled: true, value }), () => finish({ settled: false })); }
    catch { finish({ settled: false }); }
  });
}

export async function logoutWithNativeFence(options: {
  userId: string;
  setNativeAccount(account: string | null): Promise<NativeAlarmPrivacyStatus>;
  // Must reject when authentication logout is unconfirmed (including error responses).
  signOut(): Promise<unknown>;
  getFreshAccount(): Promise<string | null>;
  isCurrent(): boolean;
  onUnconfirmedCleanup(): void;
}) {
  const cleanup = await bounded(() => options.setNativeAccount(null));
  const confirmed = cleanup.settled && (cleanup.value.state === "ready" || cleanup.value.state === "unsupported");
  if (!confirmed) options.onUnconfirmedCleanup();
  // Native failures/timeouts do not clear the journal/guard and cannot block logout.
  // A late native promise is consumed, never used to retry auth or restore an account.
  try { await options.signOut(); }
  catch (error) {
    const current = await bounded(options.getFreshAccount);
    if (current.settled && current.value === options.userId && options.isCurrent()) {
      await bounded(() => options.setNativeAccount(options.userId));
    }
    throw error;
  }
  return { nativeCleanupConfirmed: confirmed };
}
