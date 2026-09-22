import brand from "../src/data/tia-brand.json" with { type: "json" };

// One editable geometry for React, SVG, raster exports and Android themed icons.
// The entire mark fits Android's central 66/108 safe circle, not just its box.
export function tiaIconSvg({ transparent = false, round = false, maskable = false, monochrome = false, backgroundOnly = false } = {}) {
  const background = round
    ? '<circle cx="256" cy="256" r="256" fill="url(#tia)"/>'
    : `<rect width="512" height="512" rx="${maskable ? 0 : 120}" fill="url(#tia)"/>`;
  const ink = monochrome ? "#ffffff" : brand.ink[0];
  const mark = brand.paths.map(({ d, width }) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="tia">
  <defs><linearGradient id="tia" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${brand.background[0]}"/><stop offset="1" stop-color="${brand.background[1]}"/></linearGradient></defs>
  ${transparent || monochrome ? "" : background}
  ${backgroundOnly ? "" : `${mark}\n<circle cx="${brand.dot.x}" cy="${brand.dot.y}" r="${brand.dot.radius}" fill="${ink}"/>`}
  </svg>`;
}

export function tiaMonochromeVector() {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="512" android:viewportHeight="512">
${brand.paths.map(({ d, width }) => `  <path android:pathData="${d}" android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="${width}" android:strokeLineCap="round" android:strokeLineJoin="round"/>`).join("\n")}
  <path android:fillColor="#FFFFFFFF" android:pathData="M${brand.dot.x - brand.dot.radius},${brand.dot.y}a${brand.dot.radius},${brand.dot.radius} 0,1 0,${brand.dot.radius * 2},0a${brand.dot.radius},${brand.dot.radius} 0,1 0,-${brand.dot.radius * 2},0"/>
</vector>\n`;
}

// Inline HTML already establishes SVG's namespace; no network URL is needed.
export function tiaInlineIconSvg(size = 48) {
  if (![44, 48].includes(size)) throw new Error("Unsupported inline icon size");
  return tiaIconSvg().replace(' xmlns="http://www.w3.org/2000/svg"', '')
    .replace('role="img" aria-label="tia"', `width="${size}" height="${size}" aria-hidden="true"`);
}
