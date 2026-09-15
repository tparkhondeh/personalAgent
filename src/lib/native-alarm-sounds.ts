"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { createAlarmSoundController, type AlarmSoundNativePlugin } from "./alarm-sounds";

const plugin = registerPlugin<AlarmSoundNativePlugin>("TiaAlarmSounds");
export function nativeAlarmSoundPlugin() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" &&
    Capacitor.isPluginAvailable("TiaAlarmSounds") ? plugin : undefined;
}
export function deviceAlarmSoundController() {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* The controller reports unavailable storage. */ }
  return createAlarmSoundController({
    native: Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android",
    plugin: nativeAlarmSoundPlugin(), storage,
    createAudio: url => new Audio(url),
  });
}
