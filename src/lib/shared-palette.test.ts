import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { planPersian } from "./agent-planner";
describe("generated palette and planner parity",()=>{
  it("maps web action gradients to both offline entry points",()=>{
    const mobile=readFileSync("mobile-shell/theme.css","utf8");
    expect(mobile).toMatch(/\.nav-button\.new\{[^}]*background: linear-gradient\(145deg, #5b70b5, #4f7b72\)/);
    expect(mobile).toMatch(/\.primary,\.top-actions \[data-open-form\]\{[^}]*background: linear-gradient\(135deg, #5b70b5 0%, #4f7b72 115%\)/);
    expect(mobile).toMatch(/:root\[data-theme="dark"\] \.top-actions \[data-open-form\]\{[^}]*linear-gradient/);
    expect(mobile).toContain('background:var(--surface-solid);border-color:var(--line);color:var(--ink)');
  });
  it("keeps every web light/dark root token in the APK stylesheet",()=>{
    const web=readFileSync("src/app/globals.css","utf8"),mobile=readFileSync("mobile-shell/theme.css","utf8");
    const roots=[...web.matchAll(/:root(?:\[data-theme="dark"\])?\s*\{([^}]+)\}/g)].filter(root=>root[1].includes('--bg:'));expect(roots.length).toBe(2);
    for(const root of roots)for(const declaration of root[1].split(";").map(d=>d.trim()).filter(Boolean))expect(mobile).toContain(declaration);
  });
  it("runs the same planner in the bundled JavaScript runtime",()=>{
    const context={window:{}};runInNewContext(readFileSync("mobile-shell/planner.js","utf8"),context);
    const parser=(context.window as {HamrahPlanner:{planPersian:typeof planPersian}}).HamrahPlanner;
    const message="فردا ساعت پنج عصر جلسه با تیم فروش دارم؛ یک روز قبل و سه ساعت قبل یادم بنداز";
    const options={now:new Date("2026-09-06T08:00:00Z")};
    expect(JSON.parse(JSON.stringify(parser.planPersian(message,options)))).toEqual(JSON.parse(JSON.stringify(planPersian(message,options))));
  });
});
