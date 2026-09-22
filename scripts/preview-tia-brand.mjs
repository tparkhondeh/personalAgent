import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { tiaIconSvg } from "./tia-logo.mjs";

// Design proof, not an Android screenshot. All tiles use production geometry.
const embed = options => `data:image/svg+xml;base64,${Buffer.from(tiaIconSvg(options)).toString("base64")}`;
const tile = (x, y, size, options = {}) => `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${embed(options)}"/>`;
const labels = (text, x, y, color = "#344767", size = 18) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${color}">${text}</text>`;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600">
<rect width="500" height="600" fill="#f7f7ff"/><rect x="500" width="500" height="600" fill="#13151f"/>
${labels("tia / a calmer everyday", 42, 52, "#344767", 24)}${labels("DARK SURFACE", 542, 52, "#b2b6c9", 16)}
${tile(120, 95, 256)}${tile(622, 95, 256, { round: true })}
${labels("SQUIRCLE", 42, 400)}${labels("ROUND", 542, 400, "#b2b6c9")}
${[24, 32, 48, 64].map((size, i) => tile(42 + i * 100, 430 + (64 - size) / 2, size) + labels(String(size), 42 + i * 100, 530, "#66718c", 14)).join("")}
${[24, 32, 48, 64].map((size, i) => tile(542 + i * 100, 430 + (64 - size) / 2, size, { round: true }) + labels(String(size), 542 + i * 100, 530, "#b2b6c9", 14)).join("")}
${labels("ONE MARK / WEB + PWA + ANDROID", 42, 577, "#66718c", 13)}
</svg>`;
await mkdir("docs/assets", { recursive: true });
await sharp(Buffer.from(sheet)).png().toFile("docs/assets/tia-logo-preview.png");
console.log("Brand proof: docs/assets/tia-logo-preview.png");
