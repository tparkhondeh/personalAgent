// The web stylesheet is the palette authority. No second Android colour table.
import { readFile } from "node:fs/promises";
export async function sharedMobileTheme(root = process.cwd()) {
  const css = await readFile(`${root}/src/app/globals.css`, "utf8");
  const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
  const light = css.slice(0, darkAt), dark = css.slice(darkAt);
  const rule = (source, selector) => {
    const start = source.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`Missing canonical theme rule: ${selector}`);
    return source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
  };
  const palette = (body) => body.split(";").filter(part => /^\s*(background(?:-attachment)?|color|border-color|box-shadow)\s*:/.test(part)).join(";") + ";";
  const mapped = (source, from, to) => `${to}{${palette(rule(source, from))}}`;
  return `/* Generated from src/app/globals.css; do not edit. */
:root{${rule(light, ":root")}color-scheme:light;--text:var(--ink);--soft:var(--surface-soft);--lav:var(--lavender);--blue:var(--sky);--primary2:var(--primary);--shadow:var(--shadow-sm)}
body{${palette(rule(light, "body"))}font-family:Vazirmatn,Tahoma,Arial,sans-serif;font-feature-settings:"ss01" 1,"tnum" 1;text-rendering:optimizeLegibility}
${mapped(light, ".primary-button, .submit-button", ".primary")}
${mapped(light, ".content-card, .calendar-card, .preferences-card", ".card,.item")}
${mapped(light, ".focus-card", ".stat:nth-child(2)")}
${mapped(light, ".summary-card.peach", ".stat:nth-child(3)")}
${mapped(light, ".summary-card.lavender", ".stat:nth-child(1)")}
.nav-button.active{background:var(--primary-soft);color:var(--primary-strong)}
.round-button,.bottom-nav{background:var(--surface)}.chip.active{background:var(--primary-soft);color:var(--primary-strong)}
@media(prefers-color-scheme:dark){:root{${rule(dark, ":root")}color-scheme:dark}
${mapped(dark, "body", "body")}
${mapped(dark, ".sidebar, .mobile-nav", ".bottom-nav")}
${mapped(dark, ".focus-card", ".stat:nth-child(2)")}
${mapped(dark, ".summary-card.peach", ".stat:nth-child(3)")}
${mapped(dark, ".summary-card.lavender", ".stat:nth-child(1)")}
.card,.item,.round-button{background:var(--surface-solid)}.primary{color:#fff}}
`;
}
