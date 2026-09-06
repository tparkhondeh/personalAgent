import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planOccurrences, planPersian } from "./agent-planner";
import { buildEscalationPlan, defaultEscalationPolicy } from "./escalations";

const web = readFileSync("src/components/agent-assistant.tsx", "utf8");
const mobile = readFileSync("mobile-shell/app.js", "utf8");
describe("program recurrence and overdue follow-up are distinct", () => {
  it("labels recurrence and native notifications consistently", () => {
    for (const source of [web, mobile]) {
      expect(source).toContain("تکرار برنامه");
      expect(source).toMatch(/NATIVE:\s*"Notification"/);
      expect(source).not.toContain("اعلان گوشی");
      expect(source).toContain("تعداد هشدار پس از موعد");
      expect(source).toContain("فاصله پیگیری هشدار (دقیقه)");
    }
  });
  it("gates both repeat inputs on explicit escalation in both interfaces", () => {
    expect(web).toMatch(/p\.escalation && <>[\s\S]*?value=\{p\.repeatCount\}[\s\S]*?value=\{p\.repeatMinutes\}[\s\S]*?<\/\>\}/);
    expect(mobile).toMatch(/p\.escalation\?\[\["تعداد هشدار پس از موعد"[\s\S]*?p\.repeatMinutes\]\]:\[\]/);
  });
  it("can follow up one non-recurring task without making duplicate tasks", () => {
    const plan = planPersian("فردا ساعت ۱۷ خرید دارو را ثبت کن", { now: new Date("2026-09-06T08:00:00Z") }).plan!;
    plan.escalation = true; plan.repeatCount = 3; plan.repeatMinutes = 15;
    expect(plan.recurrence).toBe("NONE");
    expect(planOccurrences(plan)).toHaveLength(1);
    const anchor = new Date("2026-09-07T13:30:00Z");
    const alerts = buildEscalationPlan(anchor, { ...defaultEscalationPolicy, urgentMaxRepeats: plan.repeatCount, urgentRepeatMinutes: plan.repeatMinutes });
    expect(alerts.filter(a => a.level === "ANDROID_ALARM").map(a => (a.scheduledFor.getTime() - anchor.getTime()) / 60000)).toEqual([15, 30, 45]);
  });
  it("does not schedule escalation merely because an interval has a stored default", () => {
    expect(buildEscalationPlan(new Date(), { ...defaultEscalationPolicy, urgentEscalationEnabled: false, urgentRepeatMinutes: 15 })).toEqual([]);
  });
});
