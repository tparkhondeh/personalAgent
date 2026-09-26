import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logoutWithNativeFence, NATIVE_LOGOUT_WAIT_MS } from "./logout-session";
import type { NativeAlarmPrivacyStatus } from "./native-alarm-session";

const status = (state: NativeAlarmPrivacyStatus["state"]): NativeAlarmPrivacyStatus => ({ state, canSchedule: false, message: state });
function fixture() {
  return {
    userId: "synthetic-a",
    setNativeAccount: vi.fn<(account: string | null) => Promise<NativeAlarmPrivacyStatus>>(async () => status("ready")),
    signOut: vi.fn(async () => undefined),
    getFreshAccount: vi.fn(async (): Promise<string | null> => "synthetic-a"),
    isCurrent: vi.fn(() => true),
    onUnconfirmedCleanup: vi.fn(),
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("bounded native cleanup never traps authentication logout", () => {
  it.each(["ready", "unsupported", "cleaning", "blocked"] as const)("calls auth once after native %s and never acknowledges uncertain cleanup", async state => {
    const f = fixture(); f.setNativeAccount.mockResolvedValue(status(state));
    const result = await logoutWithNativeFence(f);
    expect(f.setNativeAccount.mock.calls).toEqual([[null]]);
    expect(f.signOut).toHaveBeenCalledOnce(); expect(f.getFreshAccount).not.toHaveBeenCalled();
    const confirmed = state === "ready" || state === "unsupported";
    expect(result.nativeCleanupConfirmed).toBe(confirmed);
    expect(f.onUnconfirmedCleanup).toHaveBeenCalledTimes(confirmed ? 0 : 1);
  });
  it.each(["bridge", "storage"])("still signs out on synchronous %s failure without restoring or clearing cleanup intent", async failure => {
    const f = fixture();
    f.setNativeAccount.mockImplementation(() => { throw Error(`synthetic ${failure} failure`); });
    expect(await logoutWithNativeFence(f)).toEqual({ nativeCleanupConfirmed: false });
    expect(f.signOut).toHaveBeenCalledOnce(); expect(f.onUnconfirmedCleanup).toHaveBeenCalledOnce();
    expect(f.setNativeAccount.mock.calls).toEqual([[null]]); expect(f.getFreshAccount).not.toHaveBeenCalled();
  });
  it("consumes an asynchronous bridge rejection and still signs out exactly once", async () => {
    const f = fixture(); f.setNativeAccount.mockRejectedValue(Error("synthetic bridge rejection"));
    await logoutWithNativeFence(f);
    expect(f.signOut).toHaveBeenCalledOnce(); expect(f.onUnconfirmedCleanup).toHaveBeenCalledOnce();
  });
  it("fences synchronously, waits no more than five seconds, and ignores a late cleanup result", async () => {
    const f = fixture(); let finish!: (value: NativeAlarmPrivacyStatus) => void;
    let fenced = false;
    f.setNativeAccount.mockImplementation(() => { fenced = true; return new Promise(resolve => { finish = resolve; }); });
    const logout = logoutWithNativeFence(f);
    expect(fenced).toBe(true); expect(NATIVE_LOGOUT_WAIT_MS).toBeLessThanOrEqual(5000);
    await vi.advanceTimersByTimeAsync(4999); expect(f.signOut).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await logout).toEqual({ nativeCleanupConfirmed: false });
    expect(f.signOut).toHaveBeenCalledOnce(); expect(f.onUnconfirmedCleanup).toHaveBeenCalledOnce();
    finish(status("ready")); await Promise.resolve();
    expect(f.setNativeAccount.mock.calls).toEqual([[null]]); expect(f.signOut).toHaveBeenCalledOnce();
    expect(f.getFreshAccount).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("restores only after an actual auth failure and a matching fresh, still-mounted account", async () => {
    const f = fixture(); const failure = Error("synthetic auth failure");
    f.signOut.mockRejectedValue(failure);
    await expect(logoutWithNativeFence(f)).rejects.toBe(failure);
    expect(f.signOut).toHaveBeenCalledOnce(); expect(f.getFreshAccount).toHaveBeenCalledOnce();
    expect(f.setNativeAccount.mock.calls).toEqual([[null], ["synthetic-a"]]);
    expect(f.signOut.mock.invocationCallOrder[0]).toBeLessThan(f.getFreshAccount.mock.invocationCallOrder[0]);
    expect(f.getFreshAccount.mock.invocationCallOrder[0]).toBeLessThan(f.setNativeAccount.mock.invocationCallOrder[1]);
  });
  it.each(["different-account", "expired", "unmounted", "read-failed"])("keeps the native fence on failed logout with %s", async situation => {
    const f = fixture(); f.signOut.mockRejectedValue(Error("synthetic auth failure"));
    if (situation === "different-account") f.getFreshAccount.mockResolvedValue("synthetic-b");
    if (situation === "expired") f.getFreshAccount.mockResolvedValue(null);
    if (situation === "unmounted") f.isCurrent.mockReturnValue(false);
    if (situation === "read-failed") f.getFreshAccount.mockRejectedValue(Error("synthetic session failure"));
    await expect(logoutWithNativeFence(f)).rejects.toThrow("synthetic auth failure");
    expect(f.setNativeAccount.mock.calls).toEqual([[null]]); expect(f.signOut).toHaveBeenCalledOnce();
  });
  it("does not hang the UI again if fresh session verification hangs after an auth failure", async () => {
    const f = fixture(); f.signOut.mockRejectedValue(Error("synthetic auth failure"));
    f.getFreshAccount.mockImplementation(() => new Promise(() => {}));
    const result = expect(logoutWithNativeFence(f)).rejects.toThrow("synthetic auth failure");
    await vi.advanceTimersByTimeAsync(5000); await result;
    expect(f.setNativeAccount.mock.calls).toEqual([[null]]); expect(f.signOut).toHaveBeenCalledOnce();
  });
});
