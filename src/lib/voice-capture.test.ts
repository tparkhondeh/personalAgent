import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceCapture } from "./voice-capture";

class Recorder {
  static last: Recorder;
  state = "inactive"; mimeType = "audio/webm";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void; onerror?: () => void;
  constructor() { Recorder.last = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["synthetic audio"]) }); this.onstop?.(); }
}
const stop = vi.fn(), permission = vi.fn(), update = vi.fn(), audio = vi.fn();
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); permission.mockResolvedValue({ getTracks: () => [{ stop }] }); vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: permission } }); vi.stubGlobal("MediaRecorder", Recorder); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("shared local voice capture", () => {
  it("requests only audio on explicit start and returns a playable clip on stop", async () => {
    const capture = createVoiceCapture(update, audio); expect(permission).not.toHaveBeenCalled();
    await capture.start(); expect(permission).toHaveBeenCalledWith({ audio: true }); expect(update).toHaveBeenLastCalledWith("recording", expect.any(String));
    capture.stop(); expect(audio.mock.lastCall?.[0].size).toBeGreaterThan(0); expect(update.mock.lastCall?.[0]).toBe("ready"); expect(stop).toHaveBeenCalled();
    capture.cancel(); expect(audio).toHaveBeenLastCalledWith(null); await capture.start(); expect(update.mock.lastCall?.[0]).toBe("recording"); capture.dispose();
  });
  it("releases a late permission result after cancellation", async () => {
    let allow!: (stream: unknown) => void; permission.mockImplementationOnce(() => new Promise(resolve => { allow = resolve; }));
    const capture = createVoiceCapture(update, audio); const start = capture.start(); capture.cancel(); allow({ getTracks: () => [{ stop }] }); await start;
    expect(stop).toHaveBeenCalled(); expect(update.mock.lastCall?.[0]).toBe("idle"); expect(audio).toHaveBeenLastCalledWith(null);
  });
  it("rejects permission denial without a fake recording", async () => { permission.mockRejectedValueOnce(new Error("denied")); await createVoiceCapture(update, audio).start(); expect(update).toHaveBeenLastCalledWith("idle", expect.stringContaining("اجازه میکروفون")); });
  it("stops automatically at one minute", async () => { const capture = createVoiceCapture(update, audio); await capture.start(); vi.advanceTimersByTime(60000); expect(update.mock.lastCall?.[0]).toBe("ready"); expect(stop).toHaveBeenCalled(); capture.dispose(); });
  it("bounds memory and discards oversized clips", async () => { const capture = createVoiceCapture(update, audio); await capture.start(); Recorder.last.ondataavailable?.({ data: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]) }); expect(update.mock.lastCall?.[0]).toBe("idle"); expect(audio).toHaveBeenLastCalledWith(null); capture.dispose(); });
  it("prevents callbacks and tracks after disposal", async () => { const capture = createVoiceCapture(update, audio); await capture.start(); capture.dispose(); update.mockClear(); Recorder.last.onstop?.(); await capture.start(); expect(update).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalled(); });
});
