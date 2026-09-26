import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard account boundary", () => {
  const source = readFileSync("src/components/personal-agent-dashboard.tsx", "utf8");
  it("waits for authentication before mounting the guest persistence effects", () => {
    const wrapper = source.split("export function PersonalAgentDashboard()")[1].split("function SessionDashboard")[0];
    expect(wrapper).toContain('if (isPending) return <main className="session-loading"');
    expect(wrapper).toContain('key={session?.user.id ? `user:${session.user.id}` : "guest"}');
    expect(wrapper).not.toContain("localStorage.setItem(");
  });
  it("does not reclassify account data as demo items during sign-out", () => {
    const dashboard = source.split("function SessionDashboard")[1].split("function Assistant")[0];
    expect(dashboard).toContain('session: ReturnType<typeof authClient.useSession>["data"]');
    expect(dashboard).toContain('useState<Item[]>([])');
    expect(source).not.toContain('const demoItems');
    expect(dashboard).toContain('if (signedIn) return false;');
    expect(dashboard).toContain('if (!guestStorageReady)');
    expect(dashboard).toContain('const result = await saveGuestItems(');
    expect(dashboard).toContain('next, guestSnapshot.current');
    expect(dashboard).toContain('if (!hydrated || (!signedIn && !guestStorageReady)) return;');
    expect(dashboard).not.toContain('const { data: session } = authClient.useSession()');
  });
  it("watches native privacy on guest startup and bounds cleanup without blocking logout", () => {
    expect(source).toContain("watchNativeAlarmSession(session?.user.id ?? null, setNativePrivacy)");
    expect(source).toContain("watcher?.stop()");
    expect(source).toContain("nativeWatcher.current?.retry()");
    expect(source).toContain('nativePrivacy.message && <p className="page-message" role="alert">');
    const logout = source.split("async function logout()")[1].split("async function markNotificationsRead")[0];
    expect(logout).toContain("await logoutWithNativeFence({");
    expect(logout).toContain("setNativeAccount: setNativeAlarmAccount");
    expect(logout).toContain("signOut: () => logoutWithPushCleanup(");
    expect(logout).toContain('authClient.getSession({ fetchOptions: { cache: "no-store" } })');
    expect(logout).toContain("isCurrent: () => nativeWatcher.current === watcher");
    expect(logout).not.toContain('cleanup.state === "blocked"');
    expect(source).toContain('nativePrivacy.state === "cleaning" ? NATIVE_CLEANUP_WARNING');
    expect(source).toContain('(nativePrivacy.state === "blocked" || nativePrivacy.state === "cleaning")');
    expect(source).not.toContain("Promise.allSettled([clearApprovedDeviceReminders()");
  });
});
