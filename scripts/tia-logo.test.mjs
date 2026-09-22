import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { tiaIconSvg, tiaMonochromeVector } from "./tia-logo.mjs";
import { iconDensities } from "./generate-brand-assets.mjs";
import brand from "../src/data/tia-brand.json" with { type: "json" };

const read = name => readFile(name, "utf8");
const pixels = async svg => sharp(Buffer.from(svg)).resize(512, 512).ensureAlpha().raw().toBuffer();

describe("one tia mark across web and native", () => {
  it("generates identical editable SVG and monochrome Android geometry", async () => {
    expect((await read("public/icon.svg")).replaceAll("\r\n", "\n")).toBe(tiaIconSvg());
    expect((await read("android/app/src/main/res/drawable/ic_launcher_monochrome.xml")).replaceAll("\r\n", "\n")).toBe(tiaMonochromeVector());
    const react = await read("src/components/tia-mark.tsx");
    expect(react).toContain('@/data/tia-brand.json');
    expect(react).toContain("brand.paths.map");
    for (const path of brand.paths) expect(tiaMonochromeVector()).toContain(path.d);
  });

  it("keeps all visible foreground pixels inside Android's circular safe zone", async () => {
    const data = await pixels(tiaIconSvg({ transparent: true }));
    let visible = 0, clipped = 0;
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      if (data[(y * 512 + x) * 4 + 3] > 0) {
        visible++;
        if (Math.hypot(x + .5 - 256, y + .5 - 256) > 512 * 33 / 108) clipped++;
      }
    }
    expect(visible).toBeGreaterThan(20_000);
    expect(clipped).toBe(0);
  });

  it("keeps maskable/Apple backgrounds opaque and preserves the PWA identity", async () => {
    const manifest = JSON.parse(await read("public/manifest.webmanifest"));
    expect(manifest).toMatchObject({ id: "/", scope: "/", start_url: "/?view=tasks" });
    expect(manifest.icons).toContainEqual({ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" });
    for (const name of ["icon-maskable-512.png", "apple-touch-icon.png"]) {
      const data = await sharp(`public/${name}`).ensureAlpha().raw().toBuffer();
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) throw new Error(`${name}: transparent pixel`);
    }
  });

  it("matches every Android raster and both adaptive resource maps", async () => {
    for (const [density, size, layerSize] of iconDensities) {
      for (const [name, options, pixels] of [["ic_launcher", {}, size], ["ic_launcher_round", { round: true }, size], ["ic_launcher_foreground", { transparent: true }, layerSize], ["ic_launcher_background", { maskable: true, backgroundOnly: true }, layerSize]]) {
        const file = `android/app/src/main/res/mipmap-${density}/${name}.png`;
        const expected = await sharp(Buffer.from(tiaIconSvg(options))).resize(pixels, pixels).ensureAlpha().raw().toBuffer();
        expect((await sharp(file).ensureAlpha().raw().toBuffer()).equals(expected), file).toBe(true);
      }
    }
    for (const name of ["ic_launcher", "ic_launcher_round"]) {
      const xml = await read(`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`);
      expect(xml).toContain('@mipmap/ic_launcher_background');
      expect(xml).toContain('@drawable/ic_launcher_monochrome');
    }
  });

  it("embeds the same mark in native and PWA recovery without fetching an image", async () => {
    const native = await read("mobile-shell/connection-error.html");
    const web = await read("public/pwa-recovery.js");
    const html = JSON.parse(web.match(/self.TIA_RECOVERY_PAGE=(.*);\n/)?.[1] || "null");
    for (const { d } of brand.paths) {
      expect(native).toContain(`d="${d}"`);
      expect(html).toContain(`d="${d}"`);
    }
    expect(html).not.toContain("<img");
  });
});
