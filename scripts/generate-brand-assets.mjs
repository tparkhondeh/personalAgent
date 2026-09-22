import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { tiaIconSvg, tiaMonochromeVector } from "./tia-logo.mjs";

export const iconDensities = [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216], ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]];

export async function generateBrandAssets(projectRoot = process.cwd()) {
  const resources = path.join(projectRoot, "android/app/src/main/res");
  const icon = Buffer.from(tiaIconSvg());
  for (const [density, size, layerSize] of iconDensities) {
    const directory = path.join(resources, `mipmap-${density}`);
    await mkdir(directory, { recursive: true });
    for (const [name, options, pixels] of [
      ["ic_launcher", {}, size], ["ic_launcher_round", { round: true }, size],
      ["ic_launcher_foreground", { transparent: true }, layerSize],
      ["ic_launcher_background", { maskable: true, backgroundOnly: true }, layerSize],
    ]) {
      await sharp(Buffer.from(tiaIconSvg(options))).resize(pixels, pixels).png().toFile(path.join(directory, `${name}.png`));
    }
  }
  await writeFile(path.join(resources, "drawable/ic_launcher_monochrome.xml"), tiaMonochromeVector());
  await writeFile(path.join(projectRoot, "public/icon.svg"), icon);
  await writeFile(path.join(projectRoot, "public/icon-maskable.svg"), tiaIconSvg({ maskable: true }));
  for (const [name, size, options] of [
    ["icon-192", 192, {}], ["icon-512", 512, {}],
    ["icon-maskable-512", 512, { maskable: true }], ["apple-touch-icon", 180, { maskable: true }],
  ]) await sharp(Buffer.from(tiaIconSvg(options))).resize(size, size).png().toFile(path.join(projectRoot, `public/${name}.png`));
  const favicon = await sharp(icon).resize(32, 32).png().toBuffer();
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico[6] = 32; ico[7] = 32;
  ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(favicon.length, 14); ico.writeUInt32LE(22, 18);
  await writeFile(path.join(projectRoot, "src/app/favicon.ico"), Buffer.concat([ico, favicon]));
}
