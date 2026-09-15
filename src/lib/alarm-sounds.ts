// Import-free: also compiled into the bundled/offline alarm helper.
export const ALARM_SOUNDS = [
  { id: "dawn", label: "سپیده", file: "tia_alarm_dawn_v1.wav" },
  { id: "chime", label: "آوای آرام", file: "tia_alarm_chime_v1.wav" },
  { id: "pulse", label: "ضرب‌آهنگ", file: "tia_alarm_pulse_v1.wav" },
] as const;
export type AlarmSoundId = typeof ALARM_SOUNDS[number]["id"];
export const DEFAULT_ALARM_SOUND: AlarmSoundId = "dawn";
export const ALARM_SOUND_STORAGE_KEY = "tia.alarm-sound.v1";
export const ALARM_SOUND_HELP = "انتخاب صدا فقط برای زنگ‌های جدید این دستگاه است؛ زمان و صدای زنگ‌های قبلی حفظ می‌شود. بلندی زنگ و اعلان جداست و حالت مزاحم نشوید رعایت می‌شود.";
export const LEGACY_ALARM_SOUND_HELP = "این نسخه اپ قابلیت انتخاب صدای زنگ و بازکردن تنظیمات صدا را ندارد؛ زنگ‌های جدید با صدای قبلی تنظیم می‌شوند. بلندی صدا را از تنظیمات خود گوشی تغییر دهید.";
export const WEB_ALARM_SOUND_HELP = "در مرورگر فقط نمونه صدا پخش و انتخاب همین مرورگر ذخیره می‌شود؛ صدای زنگ گوشی از داخل اپ اندروید تنظیم می‌شود.";

export function isAlarmSoundId(value: unknown): value is AlarmSoundId {
  return ALARM_SOUNDS.some(sound => sound.id === value);
}
export function alarmSound(value: unknown) {
  return ALARM_SOUNDS.find(sound => sound.id === value) ?? ALARM_SOUNDS[0];
}
export function alarmSoundChannelId(id: AlarmSoundId) { return `tia-alarm-v1-${id}`; }

export interface AlarmSoundNativePlugin {
  getSelection(): Promise<{ soundId: string }>;
  setSelection(options: { soundId: string }): Promise<{ soundId: string }>;
  ensureChannel(): Promise<{ channelId: string; soundId: string }>;
  preview(options: { soundId: string }): Promise<void>;
  stopPreview(): Promise<void>;
  openSoundSettings(): Promise<void>;
}
export type AlarmSoundState = {
  soundId: AlarmSoundId;
  mode: "android" | "legacy" | "web";
  message: string;
};
type PreviewAudio = { play(): Promise<void>; pause(): void; currentTime: number };
export type AlarmSoundEnvironment = {
  native: boolean;
  plugin?: AlarmSoundNativePlugin;
  storage?: Pick<Storage, "getItem" | "setItem">;
  createAudio?: (url: string) => PreviewAudio;
  assetBase?: string;
};

export function createAlarmSoundController(env: AlarmSoundEnvironment) {
  let audio: PreviewAudio | undefined;
  let previewVersion = 0;
  let previewQueue: Promise<unknown> = Promise.resolve();
  function enqueuePreview(action: () => Promise<void>) {
    const next = previewQueue.then(action);
    previewQueue = next.catch(() => {});
    return next;
  }
  function stopWebPreview() {
    if (audio) { audio.pause(); audio.currentTime = 0; audio = undefined; }
  }
  return {
    async read(): Promise<AlarmSoundState> {
      if (env.native) {
        if (env.plugin) {
          const result = await env.plugin.getSelection();
          if (!isAlarmSoundId(result.soundId)) throw new Error("انتخاب صدای دستگاه معتبر نیست.");
          return { soundId: result.soundId, mode: "android", message: ALARM_SOUND_HELP };
        }
        return { soundId: DEFAULT_ALARM_SOUND, mode: "legacy", message: LEGACY_ALARM_SOUND_HELP };
      }
      // Storage failures stay visible; do not replace unreadable saved data.
      if (!env.storage) throw new Error("حافظه انتخاب صدا در دسترس نیست.");
      const stored = env.storage.getItem(ALARM_SOUND_STORAGE_KEY);
      if (stored !== null && !isAlarmSoundId(stored)) throw new Error("انتخاب صدای ذخیره‌شده قابل خواندن نیست.");
      return { soundId: stored ?? DEFAULT_ALARM_SOUND, mode: "web", message: WEB_ALARM_SOUND_HELP };
    },
    async save(soundId: AlarmSoundId) {
      if (!isAlarmSoundId(soundId)) throw new Error("صدای انتخاب‌شده معتبر نیست.");
      if (env.native) {
        if (!env.plugin) throw new Error(LEGACY_ALARM_SOUND_HELP);
        const saved = await env.plugin.setSelection({ soundId });
        if (saved.soundId !== soundId) throw new Error("انتخاب صدا ذخیره نشد.");
      } else {
        if (!env.storage) throw new Error("حافظه انتخاب صدا در دسترس نیست.");
        env.storage.setItem(ALARM_SOUND_STORAGE_KEY, soundId);
        if (env.storage.getItem(ALARM_SOUND_STORAGE_KEY) !== soundId) throw new Error("انتخاب صدا ذخیره نشد.");
      }
      // No preview, scheduling, permission request or channel mutation on save.
    },
    preview(soundId: AlarmSoundId) {
      if (!isAlarmSoundId(soundId)) return Promise.reject(new Error("صدای انتخاب‌شده معتبر نیست."));
      const version = ++previewVersion;
      stopWebPreview();
      return enqueuePreview(async () => {
        if (version !== previewVersion) return;
        if (env.native) {
          if (!env.plugin) throw new Error(LEGACY_ALARM_SOUND_HELP);
          await env.plugin.preview({ soundId });
        } else {
          if (!env.createAudio) throw new Error("پخش نمونه صدا در دسترس نیست.");
          audio = env.createAudio(`${env.assetBase ?? "/alarm-sounds/"}${alarmSound(soundId).file}`);
          await audio.play();
        }
      });
    },
    stopPreview() {
      ++previewVersion;
      stopWebPreview();
      return enqueuePreview(async () => { if (env.native && env.plugin) await env.plugin.stopPreview(); });
    },
    async openSoundSettings() {
      if (!env.native || !env.plugin) throw new Error(env.native ? LEGACY_ALARM_SOUND_HELP : WEB_ALARM_SOUND_HELP);
      await env.plugin.openSoundSettings();
    },
  };
}

// Missing plugins retain the exact legacy channel; never invent a working alarm stream.
export async function prepareDeviceAlarmChannel(
  plugin: AlarmSoundNativePlugin | undefined,
  ensureLegacy: () => Promise<void>,
  legacyChannelId: string,
) {
  if (plugin) {
    // A present but failing plugin is an error, not silent success with another sound.
    const result = await plugin.ensureChannel();
    if (!isAlarmSoundId(result.soundId) || result.channelId !== alarmSoundChannelId(result.soundId)) {
      throw new Error("کانال صدای زنگ معتبر نیست.");
    }
    return { channelId: result.channelId, sound: alarmSound(result.soundId).file, legacySound: false };
  }
  await ensureLegacy();
  return { channelId: legacyChannelId, sound: "urgent_alarm.wav", legacySound: true };
}
