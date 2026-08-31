import { describe, expect, it } from "vitest";
import { createLocalAgentResponse } from "./local-agent";

const now = new Date("2026-08-31T08:00:00.000Z");

describe("local agent fallback", () => {
  it("creates a meeting proposal without executing it", () => {
    const result = createLocalAgentResponse({ message: "فردا ساعت ۱۰ جلسه با تیم فروش بذار", now, tasks: [], meetings: [] });
    expect(result.proposal.kind).toBe("CREATE_MEETING");
    expect(result.proposal.needsApproval).toBe(true);
    expect(result.proposal.startsAt).toBeTruthy();
  });

  it("detects task category and priority", () => {
    const result = createLocalAgentResponse({ message: "کار فوری شرکت را فردا ساعت ۹ ثبت کن", now, tasks: [], meetings: [] });
    expect(result.proposal).toMatchObject({ kind: "CREATE_TASK", category: "WORK", priority: "URGENT", needsApproval: true });
  });

  it("summarizes the current plan without an executable action", () => {
    const result = createLocalAgentResponse({ message: "برنامه امروز من را خلاصه کن", now, tasks: [{ title: "گزارش", dueAt: new Date("2026-09-01T08:00:00.000Z") }], meetings: [] });
    expect(result.proposal).toMatchObject({ kind: "PLAN", needsApproval: false });
    expect(result.reply).toContain("1 کار باز");
  });
});
