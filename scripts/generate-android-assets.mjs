import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sharedMobileTheme } from "./shared-mobile-theme.mjs";
import ts from "typescript";
import { tiaIconSvg } from "./tia-logo.mjs";

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

function appIconSvg(_background = "#F7F7FF", transparent = false) {
  void _background;
  return Buffer.from(tiaIconSvg({transparent}));
}

function roundAppIconSvg() {
  return Buffer.from(tiaIconSvg({round:true}));
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
const favicon=await sharp(appIconSvg()).resize(32,32).png().toBuffer();
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=32;ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(favicon.length,14);ico.writeUInt32LE(22,18);
await writeFile(path.join(projectRoot,'src/app/favicon.ico'),Buffer.concat([ico,favicon]));

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
const overviewSource = (await Promise.all(['dashboard-overview','poem-layout'].map(name=>readFile(path.join(projectRoot, `src/lib/${name}.ts`), 'utf8')))).join('\n');
const overviewJs = ts.transpileModule(overviewSource.replace(/^export /gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
const poemScript = `window.HamrahOverview=(()=>{${overviewJs}\nreturn {selectDashboardItems,summarizeDashboardItems,createPoemNavigator,dailyPoemIndex,tehranDayKey,observePoemLayout};})();\nwindow.HamrahPoems = ${JSON.stringify(poems.selections.map(({ lines }) => lines)).replaceAll("<", "\\u003c")};\n`;
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
const captureSources=await Promise.all(["voice-capture","list-viewport","local-speech"].map(name=>readFile(path.join(projectRoot,`src/lib/${name}.ts`),"utf8")));
const captureJs=ts.transpileModule(captureSources.join("\n").replace(/^export /gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None}}).outputText;
const captureScript=`window.HamrahCapture=(()=>{${captureJs}\nreturn {createVoiceCapture,fitProgramList,createLocalSpeech,normalizeVoiceText};})();`;
await writeFile(path.join(mobileRoot,"voice-capture.js"),captureScript);
const bundledDocument = indexHtml
  .replace('<script src="./appearance.js"></script>',()=>`<script>${appearance}</script>`)
  .replace('<link rel="stylesheet" href="./app.css" />', () => `<style>${appStyles}\n${sharedTheme}</style>`)
  .replace('<link rel="stylesheet" href="./theme.css" />', "")
  .replace('<script src="./content.js"></script>', "")
  .replace('<script src="./domain.js"></script>', "")
  .replace('<script src="./planner.js"></script>', "")
  .replace('<script src="./input-controls.js"></script>', "")
  .replace('<script src="./voice-capture.js"></script>', "")
  .replace('<script src="./app.js"></script>', "");
const serializedDocument = JSON.stringify(bundledDocument).replaceAll("</", "<\\/");
const serializedScript = JSON.stringify(`${poemScript}\n${domainScript}\n${plannerScript}\n${inputControls}\n${captureScript}\n${appScript}`).replaceAll("</", "<\\/");
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
