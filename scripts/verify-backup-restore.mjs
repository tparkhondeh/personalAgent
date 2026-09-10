// Read a verified local snapshot, restore into a NEW private directory, and
// migrate only that copy. No server, scheduler, notification or provider runs.
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve("backups/local");
const source = path.resolve(process.argv[2] || "");
const relative = path.relative(root, source);
if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !source.endsWith(".db")) {
  throw new Error("Pass a snapshot inside backups/local; never a live database.");
}
const meta = JSON.parse(await readFile(`${source}.json`, "utf8"));
if (meta.integrity !== "ok") throw new Error("A verified backup manifest is required.");
const hash = async file => createHash("sha256").update(await readFile(file)).digest("hex");
const originalHash = await hash(source);
const dir = await mkdtemp(path.join(root, "restore-drill-"));
const restored = path.join(dir, "restored.db");
await copyFile(source, restored, constants.COPYFILE_EXCL);
if (await hash(restored) !== originalHash) throw new Error("Restored file differs from snapshot.");

async function fingerprint(file) {
  const client = createClient({ url: `file:${file.replaceAll("\\", "/")}` });
  try {
    await client.execute("PRAGMA query_only=ON");
    const integrity = await client.execute("PRAGMA integrity_check");
    if (integrity.rows.length !== 1 || String(integrity.rows[0].integrity_check) !== "ok") throw new Error("Snapshot integrity failed.");
    if ((await client.execute("PRAGMA foreign_key_check")).rows.length) throw new Error("Snapshot foreign keys failed.");
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const result = {};
    for (const table of tables.rows) {
      const quoted = `"${String(table.name).replaceAll('"', '""')}"`;
      const rows = (await client.execute(`SELECT * FROM ${quoted}`)).rows;
      const serialized = rows.map(row => JSON.stringify(row, (_key, value) => typeof value === "bigint" ? value.toString() : value instanceof ArrayBuffer ? Buffer.from(value).toString("base64") : value)).sort();
      result[String(table.name)] = { count: rows.length, digest: createHash("sha256").update(JSON.stringify(serialized)).digest("hex") };
    }
    return result;
  } finally { client.close(); }
}
const before = await fingerprint(source);
// Do not print migration output: the private copy can contain user information.
execFileSync(process.execPath, ["scripts/migrate.mjs"], {
  env: { ...process.env, DATABASE_URL: `file:${restored.replaceAll("\\", "/")}` },
  stdio: "pipe", windowsHide: true,
});
const after = await fingerprint(restored);
for (const [name, value] of Object.entries(before)) {
  if (JSON.stringify(value) !== JSON.stringify(after[name])) throw new Error("Migration changed existing snapshot data; review private copy.");
}
if (await hash(source) !== originalHash) throw new Error("Source snapshot changed.");
const report = { checkedAt: new Date().toISOString(), sourceHash: originalHash, restoredTo: restored, integrity: "ok", foreignKeys: "ok", existingTablesUnchanged: Object.keys(before).length, migrationOnCopy: "passed", liveDataTouched: false, schedulersStarted: false };
await writeFile(path.join(dir, "verification.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(report));
