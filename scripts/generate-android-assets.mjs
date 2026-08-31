import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const resourceRoot = path.join(projectRoot, "android", "app", "src", "main", "res");

function appIconSvg(background = "#F6F3EF", transparent = false) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#B3C3AB"/><stop offset="1" stop-color="#657966"/></linearGradient></defs>
    ${transparent ? "" : `<rect width="512" height="512" rx="150" fill="${background}"/>`}
    <rect x="76" y="76" width="360" height="360" rx="120" fill="url(#g)"/>
    <path d="M180 180v70c0 47 31 82 76 82 39 0 72-26 78-66m-154-16h154m-78-70v210" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
}

function roundAppIconSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#B3C3AB"/><stop offset="1" stop-color="#657966"/></linearGradient></defs>
    <circle cx="256" cy="256" r="252" fill="#F6F3EF"/>
    <circle cx="256" cy="256" r="180" fill="url(#g)"/>
    <path d="M180 180v70c0 47 31 82 76 82 39 0 72-26 78-66m-154-16h154m-78-70v210" fill="none" stroke="#fff" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
}

const densities = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];

for (const [density, iconSize, foregroundSize] of densities) {
  const directory = path.join(resourceRoot, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  await sharp(appIconSvg()).resize(iconSize, iconSize).png().toFile(path.join(directory, "ic_launcher.png"));
  await sharp(roundAppIconSvg()).resize(iconSize, iconSize).png().toFile(path.join(directory, "ic_launcher_round.png"));
  await sharp(appIconSvg("#00000000", true)).resize(foregroundSize, foregroundSize).png().toFile(path.join(directory, "ic_launcher_foreground.png"));
}

const sampleRate = 44_100;
const durationSeconds = 2.4;
const samples = Math.floor(sampleRate * durationSeconds);
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples * 2, 4); wav.write("WAVE", 8);
wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
for (let index = 0; index < samples; index++) {
  const second = index / sampleRate;
  const pulseOn = second % 0.6 < 0.4;
  const frequency = second % 1.2 < 0.6 ? 660 : 880;
  const envelope = Math.min(1, (second % 0.6) * 20, (0.4 - (second % 0.6)) * 20);
  const value = pulseOn ? Math.sin(2 * Math.PI * frequency * second) * Math.max(0, envelope) * 0.28 : 0;
  wav.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
}
const rawDirectory = path.join(resourceRoot, "raw");
await mkdir(rawDirectory, { recursive: true });
await writeFile(path.join(rawDirectory, "urgent_alarm.wav"), wav);

console.log("Android icons and urgent alarm generated.");
