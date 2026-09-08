import rumiDailyData from "@/data/rumi-daily.json";
import { dailyPoemIndex } from "./dashboard-overview";

export type DailyRumiSelection = {
  id: string;
  poemId: number;
  poemTitle: string;
  sourceUrl: string;
  lines: [string, string, string, string];
};

const selections = rumiDailyData.selections as DailyRumiSelection[];
export const rumiSelectionCount = selections.length;
export function getRumiSelection(index: number) { return selections[index]; }

export function getDailyRumiSelection(value = new Date()) {
  return selections[dailyPoemIndex(selections.length, value)];
}

export const rumiDailySource = rumiDailyData.source;
