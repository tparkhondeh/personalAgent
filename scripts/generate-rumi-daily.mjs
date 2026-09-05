import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GANJOOR_DATA_COMMIT = "1afaf46d311d6c6fa953aa7b87f5c6515dc807a6";
const REQUIRED_SELECTIONS = 360;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(process.argv[2] || process.env.GANJOOR_DATA_DIR || "");
const outputPath = join(projectDirectory, "src/data/rumi-daily.json");

if (!process.argv[2] && !process.env.GANJOOR_DATA_DIR) {
  throw new Error("مسیر پوشه poets/moulavi/shams/robaeesh را به‌عنوان آرگومان یا GANJOOR_DATA_DIR وارد کنید.");
}

const themeGroups = [
  ["عشق", "عاشق", "معشوق", "دلبر", "یار", "دوست", "محبوب", "وصال", "دیدار"],
  ["نور", "خورشید", "آفتاب", "ماه", "صبح", "سپیده", "چراغ", "روشن", "ستاره"],
  ["امید", "رحمت", "آرام", "آزادی", "رهایی", "بهار", "گل", "خندان", "شادی"],
  ["جان", "دل", "روح", "معنا", "حقیقت", "خدا", "آسمان", "دریا", "جهان"],
  ["رقص", "پرواز", "سفر", "راه", "قدم", "بیا", "برخیز", "آواز", "نغمه"],
];

const wordWeights = new Map([
  ["عشق", 13], ["عاشق", 10], ["دلبر", 9], ["یار", 8], ["دوست", 8],
  ["وصال", 8], ["دیدار", 7], ["نور", 9], ["خورشید", 8], ["آفتاب", 8],
  ["بهار", 8], ["امید", 8], ["رحمت", 7], ["آزاد", 7], ["رهایی", 7],
  ["خندان", 6], ["شادی", 6], ["رقص", 8], ["پرواز", 7], ["آواز", 6],
  ["جان", 5], ["دل", 4], ["روح", 5], ["معنا", 5], ["حقیقت", 5],
  ["آسمان", 5], ["دریا", 5], ["جهان", 3], ["گل", 4], ["ماه", 4],
]);

const iconicPhrases = [
  "بی همگان به سر شود", "ای عاشقان ای عاشقان", "آمد بهار جان ها", "مرده بدم زنده شدم",
  "هر نفس آواز عشق", "تو مرا جان و جهانی", "زهی عشق زهی عشق", "چه دانستم که این سودا",
  "من غلام قمرم", "ای قوم به حج رفته", "ای یوسف خوش نام ما", "دوش دیوانه شدم",
  "جان جهان", "ای خدا این وصل را هجران مکن", "بیا تا قدر یکدیگر بدانیم", "روزها فکر من این است",
];

const heavyMoodWords = ["زخم", "خون", "غم", "هجر", "ویران", "ناله", "فریاد", "مشوش", "حرام", "درد", "گریه"];

function cleanText(value) {
  return value
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
}

function searchable(value) {
  return cleanText(value)
    .replace(/[ـ،؛:!?؟«»"'().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function occurrences(text, term) {
  return text.split(term).length - 1;
}

function scoreWindow(lines, position, coupletCount) {
  const normalized = searchable(lines.join(" "));
  const lengths = lines.map((line) => searchable(line).length);
  if (lengths.some((length) => length < 12 || length > 78)) return Number.NEGATIVE_INFINITY;

  const hasIconicPhrase = iconicPhrases.some((phrase) => normalized.includes(phrase));
  if (!hasIconicPhrase && /عزرائیل|کشتگان|کافر|کفن|عجوزه|شهوت|دوزخ|لعنت|پلید|دشمن|مردار|زنا|خون|زخم/.test(normalized)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  for (const [word, weight] of wordWeights) score += occurrences(normalized, word) * weight;
  for (const word of heavyMoodWords) score -= occurrences(normalized, word) * 11;

  const matchedThemes = themeGroups.filter((terms) => terms.some((term) => normalized.includes(term))).length;
  score += matchedThemes * 9;
  if (matchedThemes >= 2) score += 8;
  for (const phrase of iconicPhrases) if (normalized.includes(phrase)) score += 90;
  if (matchedThemes === 0) score -= 20;

  const averageLength = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  score += Math.max(0, 14 - Math.abs(averageLength - 39) / 2.5);
  score += position === 0 ? 7 : Math.max(0, 4 - position * 0.15);

  if (/[0-9۰-۹]/.test(normalized)) score -= 30;
  if (/خاموش|تخلص|شمس الحق|شهوت|دشمن|دوزخ/.test(normalized)) score -= 8;
  if (/تبریز/.test(normalized) && position >= coupletCount - 3) score -= 10;
  return score;
}

function poemCandidate(poem) {
  if (!Array.isArray(poem.Verses) || !poem.FullUrl) return null;
  const grouped = new Map();
  for (const verse of poem.Verses) {
    if (!Number.isInteger(verse.CoupletIndex) || typeof verse.Text !== "string") continue;
    const group = grouped.get(verse.CoupletIndex) || [];
    group.push(verse);
    grouped.set(verse.CoupletIndex, group);
  }

  const couplets = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .filter(([, verses]) => verses.length === 2)
    .map(([index, verses]) => ({
      index,
      lines: verses.sort((left, right) => left.VOrder - right.VOrder).map((verse) => cleanText(verse.Text)),
    }));

  if (couplets.length !== 2 || couplets[0].index !== 0 || couplets[1].index !== 1) return null;
  const lines = [...couplets[0].lines, ...couplets[1].lines];
  const score = scoreWindow(lines, 0, couplets.length);
  if (!Number.isFinite(score)) return null;

  return {
    id: `${poem.Id}:0`,
    poemId: poem.Id,
    poemTitle: poem.Title,
    sourceUrl: `https://ganjoor.net${poem.FullUrl}`,
    lines,
    score,
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const rankedCandidates = readdirSync(sourceDirectory)
  .filter((name) => /^sh\d+\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(join(sourceDirectory, name), "utf8")))
  .map(poemCandidate)
  .filter(Boolean)
  .sort((left, right) => right.score - left.score || left.poemId - right.poemId);

const seenTexts = new Set();
const candidates = [];
for (const candidate of rankedCandidates) {
  const textKey = searchable(candidate.lines.join(" "));
  if (seenTexts.has(textKey)) continue;
  seenTexts.add(textKey);
  candidates.push(candidate);
  if (candidates.length === REQUIRED_SELECTIONS) break;
}

candidates.sort((left, right) => stableHash(left.id) - stableHash(right.id));

const selections = candidates.map((candidate) => ({
  id: candidate.id,
  poemId: candidate.poemId,
  poemTitle: candidate.poemTitle,
  sourceUrl: candidate.sourceUrl,
  lines: candidate.lines,
}));

if (selections.length !== REQUIRED_SELECTIONS) {
  throw new Error(`به ${REQUIRED_SELECTIONS} انتخاب نیاز است؛ ${selections.length} مورد ساخته شد.`);
}

const uniqueTexts = new Set(selections.map((item) => searchable(item.lines.join(" "))));
if (uniqueTexts.size !== REQUIRED_SELECTIONS) throw new Error("متن تکراری در مجموعه روزانه پیدا شد.");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify({
  source: {
    name: "گنجور",
    collection: "مولانا، دیوان شمس، رباعیات",
    dataCommit: GANJOOR_DATA_COMMIT,
    selectionMethod: "thematic-ranking-v1",
  },
  selections,
}, null, 2)}\n`, "utf8");

console.log(`Generated ${candidates.length} daily Rumi selections at ${outputPath}`);
