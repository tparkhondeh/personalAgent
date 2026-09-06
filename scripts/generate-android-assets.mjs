import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sharedMobileTheme } from "./shared-mobile-theme.mjs";
import ts from "typescript";

const projectRoot = process.cwd();
const resourceRoot = path.join(projectRoot, "android", "app", "src", "main", "res");
const publicRoot = path.join(projectRoot, "public");
const mobileRoot = path.join(projectRoot, "mobile-shell");
const appearanceSource=await readFile(path.join(projectRoot,"src/lib/appearance.ts"),"utf8");
const appearance=appearanceSource.match(/String\.raw`([\s\S]*?)`;/)?.[1];
if(!appearance)throw new Error("Missing shared appearance bootstrap");
await writeFile(path.join(mobileRoot,"appearance.js"),appearance);
// Native loading/splash colours are generated from the same web palette.
const canonicalCss=await readFile(path.join(projectRoot,"src/app/globals.css"),"utf8");
const paletteBlock=selector=>canonicalCss.slice(canonicalCss.indexOf(selector+' {')).match(/\{([^}]+)\}/)[1];
const nativePalettes=['light','dark'].map(mode=>{
  const block=paletteBlock(mode==='light'?':root':':root[data-theme="dark"]');
  return ['bg','ink','primary'].map(key=>`<color name="appearance_${mode}_${key}">${block.match(new RegExp(`--${key}:\\s*(#[a-fA-F0-9]+)`))[1]}</color>`).join('\n');
});
await writeFile(path.join(resourceRoot,'values','appearance.xml'),`<resources>\n${nativePalettes.join('\n')}\n</resources>\n`);

function appIconSvg(background = "#F7F7FF", transparent = false) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#AEB9EF"/><stop offset="1" stop-color="#8BC4B4"/></linearGradient></defs>
    ${transparent ? "" : `<rect width="512" height="512" rx="150" fill="${background}"/>`}
    <rect x="76" y="76" width="360" height="360" rx="120" fill="url(#g)"/>
    <path d="M180 180v70c0 47 31 82 76 82 39 0 72-26 78-66m-154-16h154m-78-70v210" fill="none" stroke="#303448" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`);
}

function roundAppIconSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#AEB9EF"/><stop offset="1" stop-color="#8BC4B4"/></linearGradient></defs>
    <circle cx="256" cy="256" r="252" fill="#F7F7FF"/>
    <circle cx="256" cy="256" r="180" fill="url(#g)"/>
    <path d="M180 180v70c0 47 31 82 76 82 39 0 72-26 78-66m-154-16h154m-78-70v210" fill="none" stroke="#303448" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
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

await writeFile(path.join(publicRoot, "icon.svg"), appIconSvg());
await sharp(appIconSvg()).resize(192, 192).png().toFile(path.join(publicRoot, "icon-192.png"));
await sharp(appIconSvg()).resize(512, 512).png().toFile(path.join(publicRoot, "icon-512.png"));
await sharp(appIconSvg()).resize(180, 180).png().toFile(path.join(publicRoot, "apple-touch-icon.png"));

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

const indexPath = path.join(mobileRoot, "index.html");
const recoveryPath = path.join(mobileRoot, "connection-error.html");
const poems = JSON.parse(await readFile(path.join(projectRoot, "src/data/rumi-daily.json"), "utf8"));
// Keep the same curated source and selection order as the web app, without external links.
const poemScript = `window.HamrahPoems = ${JSON.stringify(poems.selections.map(({ lines }) => lines)).replaceAll("<", "\\u003c")};\n`;
await writeFile(path.join(mobileRoot, "content.js"), poemScript);
const [indexHtml, appStyles, appScript, recoveryHtml, domainScript] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(path.join(mobileRoot, "app.css"), "utf8"),
  readFile(path.join(mobileRoot, "app.js"), "utf8"),
  readFile(recoveryPath, "utf8"),
  readFile(path.join(mobileRoot, "domain.js"), "utf8"),
]);
const sharedTheme = await sharedMobileTheme(projectRoot);
await writeFile(path.join(mobileRoot, "theme.css"), sharedTheme);
const plannerSource = await readFile(path.join(projectRoot,"src/lib/agent-planner.ts"),"utf8");
const plannerJs = ts.transpileModule(plannerSource.replace(/^export /gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
const inputsSource=await readFile(path.join(projectRoot,"src/lib/persian-inputs.ts"),"utf8");
const inputsJs=ts.transpileModule(inputsSource.replace(/^export /gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
const inputsScript=`window.HamrahInputs=(()=>{${inputsJs}\nreturn {dateInputValue,parsePersianInput,persianParts,persianMonths,persianMonthGrid,inputDigits,faDigits,validTime24,jalaliToIso};})();`;
const inputControls=await readFile(path.join(mobileRoot,"input-controls.js"),"utf8");
const plannerScript = `${inputsScript}\nwindow.HamrahPlanner=(()=>{${plannerJs}\nreturn {planPersian,planInstant,inspectPlan,dateParts,planOccurrences,plannedReminderTimes,normalizePlanForReview,approvalSummary};})();\n`;
await writeFile(path.join(mobileRoot,"planner.js"),plannerScript);
const bundledDocument = indexHtml
  .replace('<script src="./appearance.js"></script>',()=>`<script>${appearance}</script>`)
  .replace('<link rel="stylesheet" href="./app.css" />', () => `<style>${appStyles}\n${sharedTheme}</style>`)
  .replace('<link rel="stylesheet" href="./theme.css" />', "")
  .replace('<script src="./content.js"></script>', "")
  .replace('<script src="./domain.js"></script>', "")
  .replace('<script src="./planner.js"></script>', "")
  .replace('<script src="./input-controls.js"></script>', "")
  .replace('<script src="./app.js"></script>', "");
const serializedDocument = JSON.stringify(bundledDocument).replaceAll("</", "<\\/");
const serializedScript = JSON.stringify(`${poemScript}\n${domainScript}\n${plannerScript}\n${inputControls}\n${appScript}`).replaceAll("</", "<\\/");
const offlineDocumentMarker = /^(\s*)const bundledDocument = .*; \/\/ generated-offline-document$/m;
const offlineScriptMarker = /^(\s*)const bundledScript = .*; \/\/ generated-offline-script$/m;
if (!offlineDocumentMarker.test(recoveryHtml)) {
  throw new Error("The Android recovery page is missing its generated offline document marker.");
}
if (!offlineScriptMarker.test(recoveryHtml)) {
  throw new Error("The Android recovery page is missing its generated offline script marker.");
}
const generatedRecovery = recoveryHtml
  .replace(/<script id="hamrah-appearance">[\s\S]*?<\/script>/,()=>`<script id="hamrah-appearance">${appearance}</script>`)
  .replace(
    offlineDocumentMarker,
    (_marker, indentation) =>
      `${indentation}const bundledDocument = ${serializedDocument}; // generated-offline-document`,
  )
  .replace(
    offlineScriptMarker,
    (_marker, indentation) =>
      `${indentation}const bundledScript = ${serializedScript}; // generated-offline-script`,
  );
await writeFile(recoveryPath, generatedRecovery, "utf8");

console.log("Android icons, urgent alarm and self-contained offline recovery generated.");
