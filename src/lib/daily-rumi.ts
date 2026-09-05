import rumiDailyData from "@/data/rumi-daily.json";

export type DailyRumiSelection = {
  id: string;
  poemId: number;
  poemTitle: string;
  sourceUrl: string;
  lines: [string, string, string, string];
};

const selections = rumiDailyData.selections as DailyRumiSelection[];
const epochDay = Math.floor(Date.UTC(2026, 0, 1) / 86_400_000);

function tehranDayNumber(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return Math.floor(Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000);
}

export function getDailyRumiSelection(value = new Date()) {
  const elapsedDays = tehranDayNumber(value) - epochDay;
  const index = ((elapsedDays % selections.length) + selections.length) % selections.length;
  return selections[index];
}

export const rumiDailySource = rumiDailyData.source;
