// The web stylesheet is the palette authority. No second Android colour table.
import { readFile } from "node:fs/promises";
export async function sharedMobileTheme(root = process.cwd()) {
  const css = await readFile(`${root}/src/app/globals.css`, "utf8");
  const darkAt = css.indexOf("/* Explicit dark appearance");
  const light = css.slice(0, darkAt), dark = css.slice(darkAt);
  const rule = (source, selector) => {
    const start = source.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`Missing canonical theme rule: ${selector}`);
    return source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
  };
  const palette = (body) => body.split(";").filter(part => /^\s*(background(?:-attachment)?|color|border-color|box-shadow)\s*:/.test(part)).join(";") + ";";
  const mapped = (source, from, to) => `${to}{${palette(rule(source, from))}}`;
  const darkSelector = selector => selector.split(',').map(s=>`:root[data-theme="dark"] ${s.trim()}`).join(', ');
  const darkMapped = (from,to) => mapped(dark,darkSelector(from),darkSelector(to));
  const controls=css.slice(css.indexOf("/* Shared explicit 24-hour"));
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
:root[data-theme="dark"]{${rule(dark, ':root[data-theme="dark"]')}color-scheme:dark}
${darkMapped("body", "body")}
${darkMapped(".sidebar, .mobile-nav", ".bottom-nav")}
${darkMapped(".focus-card", ".stat:nth-child(2)")}
${darkMapped(".summary-card.peach", ".stat:nth-child(3)")}
${darkMapped(".summary-card.lavender", ".stat:nth-child(1)")}
${darkSelector('.card,.item,.round-button')}{background:var(--surface-solid)}:root[data-theme="dark"] .primary{color:#fff}
${controls.trim()}
.appearance-setting{margin-bottom:12px}.daily-poem{font-size:15px;line-height:1.9;margin-top:6px;gap:4px;font-weight:640}
.daily-poem .poem-couplet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;direction:rtl;align-items:start}
.poem-couplet>span{min-width:0;overflow-wrap:anywhere}
.app{padding-top:max(16px,env(safe-area-inset-top))}.topbar{margin-bottom:14px;gap:12px}.card{padding:16px;margin-bottom:12px}.stat{min-height:90px;padding:12px}.empty{padding:24px 14px}textarea{min-height:86px}
`;
}
