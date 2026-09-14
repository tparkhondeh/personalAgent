import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const targets = ["personal", "public", "play", "bazaar"];
// This is a recorded-evidence checklist, never a security certification or publisher.
export function readinessSummary(record) {
  if (!Array.isArray(record?.gates) || record.gates.length === 0) throw new Error("Evidence gates required");
  const ids = new Set();
  for (const gate of record.gates) {
    if (!gate.id || ids.has(gate.id) || !gate.evidence?.trim() || !Array.isArray(gate.targets) || !gate.targets.length || gate.targets.some(t => !targets.includes(t)) || !["verified", "pending", "blocked", "unknown"].includes(gate.state)) throw new Error("Invalid evidence gate");
    ids.add(gate.id);
  }
  return Object.fromEntries(targets.map(target => {
    const applicable = record.gates.filter(g => g.targets.includes(target));
    const remaining = applicable.filter(g => g.state !== "verified").map(g => g.id);
    return [target, { ready: applicable.length > 0 && remaining.length === 0 && (target === "personal" || record.publicReleaseApproved === true), remaining, approvalRequired: target !== "personal" && record.publicReleaseApproved !== true }];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const record = JSON.parse(await readFile(new URL("../docs/store/readiness.json", import.meta.url), "utf8"));
  const result = readinessSummary(record);
  console.log(JSON.stringify({ checkedOn: record.checkedOn, certification: false, ...result }));
  if (process.argv.includes("--require-ready") && Object.values(result).some(r => !r.ready)) process.exitCode = 2;
}
