import { describe, expect, it, vi } from "vitest";
import { ALARM_SOUNDS, ALARM_SOUND_STORAGE_KEY, createAlarmSoundController, prepareDeviceAlarmChannel, type AlarmSoundNativePlugin } from "./alarm-sounds";

function nativeFixture() {
  let saved = "dawn";
  const plugin = {
    getSelection: vi.fn(async () => ({ soundId: saved })),
    setSelection: vi.fn(async ({ soundId }: { soundId: string }) => { saved = soundId; return { soundId }; }),
    ensureChannel: vi.fn(async () => ({ soundId: saved, channelId: `tia-alarm-v1-${saved}` })),
    preview: vi.fn(async () => {}), stopPreview: vi.fn(async () => {}), openSoundSettings: vi.fn(async () => {}),
  } satisfies AlarmSoundNativePlugin;
  return { plugin, controller: createAlarmSoundController({ native: true, plugin }) };
}
describe("device alarm sound settings", () => {
  it("saves per native device without playing or creating channels; a new controller reads it", async () => {
    const { plugin, controller } = nativeFixture();
    expect((await controller.read()).soundId).toBe("dawn");
    await controller.save("chime");
    expect(plugin.preview).not.toHaveBeenCalled();
    expect(plugin.ensureChannel).not.toHaveBeenCalled();
    expect(plugin.openSoundSettings).not.toHaveBeenCalled();
    expect((await createAlarmSoundController({ native: true, plugin }).read()).soundId).toBe("chime");
    const legacy = vi.fn();
    expect(await prepareDeviceAlarmChannel(plugin, legacy, "old")).toEqual({channelId:"tia-alarm-v1-chime",sound:"tia_alarm_chime_v1.wav",legacySound:false});
    expect(legacy).not.toHaveBeenCalled();
  });
  it("only explicitly requested preview/settings actions call the native bridge", async () => {
    const { plugin, controller } = nativeFixture();
    await controller.read();
    await controller.preview("pulse");
    expect(plugin.preview).toHaveBeenCalledExactlyOnceWith({ soundId: "pulse" });
    await controller.stopPreview();
    await controller.openSoundSettings();
    expect(plugin.stopPreview).toHaveBeenCalledTimes(1);
    expect(plugin.openSoundSettings).toHaveBeenCalledTimes(1);
  });
  it("rapid preview/stop invalidates queued playback", async () => {
    const { plugin, controller } = nativeFixture();
    await Promise.all([controller.preview("dawn"), controller.preview("chime"), controller.stopPreview()]);
    expect(plugin.preview).not.toHaveBeenCalled();
    await Promise.all([controller.preview("dawn"), controller.preview("pulse")]);
    expect(plugin.preview).toHaveBeenCalledExactlyOnceWith({ soundId: "pulse" });
  });
  it("old APK reports legacy limitations and uses exactly the old channel", async () => {
    const createAudio = vi.fn();
    const controller = createAlarmSoundController({ native: true, createAudio });
    expect((await controller.read()).mode).toBe("legacy");
    await expect(controller.save("pulse")).rejects.toThrow("این نسخه");
    await expect(controller.preview("pulse")).rejects.toThrow("این نسخه");
    await expect(controller.openSoundSettings()).rejects.toThrow("این نسخه");
    expect(createAudio).not.toHaveBeenCalled();
    const legacy = vi.fn(async () => {});
    expect(await prepareDeviceAlarmChannel(undefined, legacy, "urgent-overdue")).toMatchObject({channelId:"urgent-overdue",sound:"urgent_alarm.wav",legacySound:true});
    expect(legacy).toHaveBeenCalledOnce();
  });
  it("native failure never silently substitutes another sound or pretends to save", async () => {
    const { plugin, controller } = nativeFixture();
    plugin.setSelection.mockRejectedValue(new Error("storage failed"));
    await expect(controller.save("chime")).rejects.toThrow("storage failed");
    plugin.ensureChannel.mockRejectedValue(new Error("bridge failed"));
    plugin.getSelection.mockRejectedValue(new Error("read failed"));
    await expect(controller.read()).rejects.toThrow("read failed");
    const legacy = vi.fn();
    await expect(prepareDeviceAlarmChannel(plugin, legacy, "old")).rejects.toThrow("bridge failed");
    expect(legacy).not.toHaveBeenCalled();
  });
  it("browser storage and previews stay browser-only; playback stops on cleanup", async () => {
    const values = new Map<string, string>();
    const storage = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
    const audio = { play:vi.fn(async()=>{}),pause:vi.fn(),currentTime:0 };
    const createAudio = vi.fn(() => audio);
    const controller = createAlarmSoundController({native:false,storage,createAudio});
    await controller.save("pulse");
    expect(createAudio).not.toHaveBeenCalled();
    expect((await controller.read()).mode).toBe("web");
    expect(values.get(ALARM_SOUND_STORAGE_KEY)).toBe("pulse");
    await controller.preview("pulse");
    expect(createAudio).toHaveBeenCalledWith("/alarm-sounds/tia_alarm_pulse_v1.wav");
    await controller.stopPreview();
    expect(audio.pause).toHaveBeenCalledOnce();
    await expect(controller.openSoundSettings()).rejects.toThrow("مرورگر");
  });
  it("unreadable/quota-limited storage never reports saved", async () => {
    const setItem = vi.fn(() => { throw new Error("quota"); });
    const controller = createAlarmSoundController({native:false,storage:{getItem:()=>"corrupt",setItem}});
    await expect(controller.read()).rejects.toThrow("قابل خواندن");
    expect(setItem).not.toHaveBeenCalled();
    await expect(controller.save("dawn")).rejects.toThrow("quota");
    const noStorage = createAlarmSoundController({native:false});
    await expect(noStorage.save("dawn")).rejects.toThrow("حافظه");
  });
  it("rejects non-catalog sound IDs at the boundary", async () => {
    const { controller, plugin } = nativeFixture();
    expect(ALARM_SOUNDS).toHaveLength(3);
    await expect(controller.save("../../other.wav" as "dawn")).rejects.toThrow("معتبر");
    expect(plugin.setSelection).not.toHaveBeenCalled();
  });
});
