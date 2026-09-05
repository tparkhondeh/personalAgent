import { describe, expect, it } from "vitest";
import rumiDailyData from "@/data/rumi-daily.json";
import { getDailyRumiSelection, rumiDailySource } from "@/lib/daily-rumi";

describe("daily Rumi selection", () => {
  it("contains 360 unique, complete quatrains with traceable Ganjoor sources", () => {
    expect(rumiDailyData.selections).toHaveLength(360);
    expect(new Set(rumiDailyData.selections.map((selection) => selection.id)).size).toBe(360);
    for (const selection of rumiDailyData.selections) {
      expect(selection.lines).toHaveLength(4);
      expect(selection.lines.every((line) => line.trim().length >= 12)).toBe(true);
      expect(selection.sourceUrl).toMatch(/^https:\/\/ganjoor\.net\/moulavi\/shams\/robaeesh\/sh\d+$/);
    }
    expect(rumiDailySource.dataCommit).toBe("1afaf46d311d6c6fa953aa7b87f5c6515dc807a6");
  });

  it("keeps one selection for the full Tehran day and changes on the next day", () => {
    const beforeMidnight = getDailyRumiSelection(new Date("2026-09-05T20:29:00.000Z"));
    const afterMidnight = getDailyRumiSelection(new Date("2026-09-05T20:31:00.000Z"));
    expect(beforeMidnight.id).not.toBe(afterMidnight.id);
    expect(afterMidnight.id).toBe(getDailyRumiSelection(new Date("2026-09-06T08:00:00.000Z")).id);
  });

  it("repeats only after the complete 360-day collection", () => {
    const first = getDailyRumiSelection(new Date("2026-01-01T08:00:00.000Z"));
    const next = getDailyRumiSelection(new Date("2026-01-02T08:00:00.000Z"));
    const repeated = getDailyRumiSelection(new Date("2026-12-27T08:00:00.000Z"));
    expect(first.id).not.toBe(next.id);
    expect(repeated.id).toBe(first.id);
  });
});
