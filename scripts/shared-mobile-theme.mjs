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
  const palette = (body) => body.split(";").filter(part => /^\s*(background(?:-attachment)?|color|border(?:-color)?|box-shadow)\s*:/.test(part)).join(";") + ";";
  const mapped = (source, from, to) => `${to}{${palette(rule(source, from))}}`;
  const darkSelector = selector => selector.split(',').map(s=>`:root[data-theme="dark"] ${s.trim()}`).join(', ');
  const darkMapped = (from,to) => mapped(dark,darkSelector(from),darkSelector(to));
  const controls=css.slice(css.indexOf("/* Shared explicit 24-hour"));
  return `/* Generated from src/app/globals.css; do not edit. */
:root{${rule(light, ":root")}color-scheme:light;--text:var(--ink);--soft:var(--surface-soft);--lav:var(--lavender);--blue:var(--sky);--primary2:var(--primary);--shadow:var(--shadow-sm)}
body{${palette(rule(light, "body"))}font-family:Vazirmatn,Tahoma,Arial,sans-serif;font-feature-settings:"ss01" 1,"tnum" 1;text-rendering:optimizeLegibility}
${mapped(light, ".primary-button, .submit-button", ".primary,.top-actions [data-open-form]")}
${mapped(light, ".settings-button, .icon-button", ".round-button:not([data-open-form])")}
${mapped(light, ".composer input, .composer select, .auth-card input, .preferences-card input, .preferences-card select", "input,select,textarea")}
${mapped(light, ".content-card, .calendar-card, .preferences-card", ".card,.item")}
${mapped(light, ".focus-card", ".stat:nth-child(2)")}
${mapped(light, ".summary-card.peach", ".stat:nth-child(3)")}
${mapped(light, ".summary-card.lavender", ".stat:nth-child(1)")}
${mapped(light, ".nav-button.active", ".nav-button.active")}
${mapped(light, ".mobile-nav", ".bottom-nav")}
${mapped(light, ".mobile-add", ".nav-button.new")}
.chip.active{background:var(--primary-soft);color:var(--primary-strong)}
:root[data-theme="dark"]{${rule(dark, ':root[data-theme="dark"]')}color-scheme:dark}
${darkMapped("body", "body")}
${darkMapped(".sidebar, .mobile-nav", ".bottom-nav")}
${darkMapped(".focus-card", ".stat:nth-child(2)")}
${darkMapped(".summary-card.peach", ".stat:nth-child(3)")}
${darkMapped(".summary-card.lavender", ".stat:nth-child(1)")}
${darkSelector('.card,.item,.round-button')}{background:var(--surface-solid);border-color:var(--line);color:var(--ink)}:root[data-theme="dark"] .primary{color:#fff}
${mapped(light, ".primary-button, .submit-button", ':root[data-theme="dark"] .top-actions [data-open-form]')}
${mapped(light, ".mobile-add", ':root[data-theme="dark"] .nav-button.new')}
${darkMapped(".nav-button.active, .working-days label.selected, .preferences-card .reminder-options label.selected", ".nav-button.active")}
${darkSelector('.round-button:not([data-open-form])')}{color:var(--ink);border-color:var(--line)}
${darkMapped(".composer input, .composer select, .auth-card input, .preferences-card input, .preferences-card select, .working-days label, .preferences-card .reminder-options label, .composer-reminder-summary", "input,select,textarea")}
${controls.trim()}
.appearance-setting{margin-bottom:12px}
.app{padding-top:max(16px,env(safe-area-inset-top))}.topbar{margin-bottom:14px;gap:12px}.card{padding:16px;margin-bottom:12px}.stat{min-height:90px;padding:12px}.empty{padding:24px 14px}textarea{min-height:44px;max-height:144px;resize:none}
`;
}
