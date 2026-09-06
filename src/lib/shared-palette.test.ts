import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { planPersian } from "./agent-planner";
describe("generated palette and planner parity",()=>{
  it("keeps every web light/dark root token in the APK stylesheet",()=>{
    const web=readFileSync("src/app/globals.css","utf8"),mobile=readFileSync("mobile-shell/theme.css","utf8");
    const roots=[...web.matchAll(/:root\s*\{([^}]+)\}/g)];expect(roots.length).toBe(2);
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
