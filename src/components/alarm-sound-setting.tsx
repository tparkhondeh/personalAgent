"use client";

import { useEffect, useRef } from "react";
import { mountAlarmSoundSettings } from "@/lib/alarm-sound-settings";
import { deviceAlarmSoundController } from "@/lib/native-alarm-sounds";

export function AlarmSoundSetting() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (root.current) return mountAlarmSoundSettings(root.current, deviceAlarmSoundController());
  }, []);
  return <div ref={root} />;
}
