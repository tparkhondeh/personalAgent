import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Original synthesized motifs, no recordings/samples/external downloads.
const motifs = {
  dawn: [[0, 0.55, 523.25], [0.55, 0.55, 659.25], [1.1, 0.85, 783.99]],
  chime: [[0, 0.95, 659.25], [0.65, 1.15, 880]],
  pulse: [[0, 0.25, 740], [0.4, 0.25, 740], [0.95, 0.3, 988], [1.4, 0.45, 740]],
};
export function synthesizeAlarmSound(id) {
  if (!Object.hasOwn(motifs, id)) throw new Error("Unknown sound");
  const rate = 22050, seconds = 2.4, samples = Math.round(rate * seconds);
  const result = Buffer.alloc(44 + samples * 2);
  result.write("RIFF", 0); result.writeUInt32LE(result.length - 8, 4); result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16); result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22);
  result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28); result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34);
  result.write("data", 36); result.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    let value = 0;
    for (const [start, duration, frequency] of motifs[id]) {
      const local = t - start;
      if (local < 0 || local >= duration) continue;
      const envelope = Math.min(1, local / 0.025, (duration - local) / 0.09) * Math.exp(-2 * local / duration);
      value += 0.36 * envelope * (Math.sin(2 * Math.PI * frequency * local) + 0.18 * Math.sin(4 * Math.PI * frequency * local));
    }
    result.writeInt16LE(Math.round(Math.max(-0.9, Math.min(0.9, value)) * 32767), 44 + i * 2);
  }
  return result;
}

export async function alarmSoundBundle(projectRoot) {
  const names = ["alarm-sounds", "device-alarm-scheduler", "alarm-sound-settings"];
  const source = (await Promise.all(names.map(name => readFile(path.join(projectRoot, `src/lib/${name}.ts`), "utf8")))).join("\n")
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
  return `// Generated from shared alarm sources; do not edit.\nwindow.HamrahAlarmSounds=(()=>{\n${compiled}\n
function nativePlugin() {
  const cap=window.Capacitor;
  return cap?.getPlatform?.()==="android" && cap?.isPluginAvailable?.("TiaAlarmSounds") ? cap.Plugins?.TiaAlarmSounds : undefined;
}
function createController() {
  let storage; try { storage=window.localStorage; } catch {}
  return createAlarmSoundController({native:window.Capacitor?.getPlatform?.()==="android",plugin:nativePlugin(),storage,createAudio:url=>new Audio(url),assetBase:"./alarm-sounds/"});
}
return {ALARM_SOUNDS,ALARM_SOUND_HELP,LEGACY_ALARM_SOUND_HELP,createController,createDeviceAlarmScheduler,
mount:root=>mountAlarmSoundSettings(root,createController()),
prepareAlarm:(ensureLegacy,legacyChannelId)=>prepareDeviceAlarmChannel(nativePlugin(),ensureLegacy,legacyChannelId)};
})();\n`;
}

// Call before reading index/app; inline the returned script before appScript in recovery.
export async function generateAlarmSoundAssets(projectRoot = process.cwd(), outputRoot = projectRoot) {
  const directories = ["public/alarm-sounds", "mobile-shell/alarm-sounds", "android/app/src/main/res/raw"];
  const manifest = { license: "CC0-1.0", provenance: "Original tia synthesized motifs; no third-party samples", sounds: [] };
  for (const directory of directories) await mkdir(path.join(outputRoot, directory), { recursive: true });
  for (const id of Object.keys(motifs)) {
    const file = `tia_alarm_${id}_v1.wav`, data = synthesizeAlarmSound(id);
    for (const directory of directories) await writeFile(path.join(outputRoot, directory, file), data);
    manifest.sounds.push({ id, file, seconds: 2.4, sampleRate: 22050, channels: 1 });
  }
  const script = await alarmSoundBundle(projectRoot);
  await writeFile(path.join(outputRoot, "mobile-shell/alarm-sounds.js"), script);
  await writeFile(path.join(outputRoot, "public/alarm-sounds/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const license = await readFile(path.join(projectRoot, "public/alarm-sounds/LICENSE.txt"), "utf8");
  await writeFile(path.join(outputRoot, "mobile-shell/alarm-sounds/LICENSE.txt"), license);
  return script;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateAlarmSoundAssets();
}
