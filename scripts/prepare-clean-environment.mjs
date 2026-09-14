// Preparation only: no account, key, listener, scheduler or provider is created.
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));

export async function inspectEmptyDatabase(database) {
  if (!(await stat(database)).isFile()) throw new Error("Existing database file required");
  const client = createClient({ url: `file:${database.replaceAll("\\", "/")}` });
  try {
    await client.execute("PRAGMA query_only=ON");
    const integrity = await client.execute("PRAGMA integrity_check");
    if (String(integrity.rows[0]?.integrity_check) !== "ok") throw new Error("Database integrity failed");
    if ((await client.execute("PRAGMA foreign_key_check")).rows.length) throw new Error("Foreign keys failed");
    const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_hamrah_migrations' ORDER BY name")).rows;
    if (!tables.some(table => table.name === "User") || !tables.some(table => table.name === "Task")) throw new Error("Application schema missing");
    for (const table of tables) {
      const name = `"${String(table.name).replaceAll('"', '""')}"`;
      const count = (await client.execute(`SELECT count(*) AS total FROM ${name}`)).rows[0].total;
      if (Number(count) !== 0) throw new Error("Environment is not empty; existing data was preserved");
    }
    return { empty: true, businessTables: tables.length, integrity: "ok", foreignKeys: "ok" };
  } finally { client.close(); }
}

export async function prepareCleanEnvironment(parent = path.join(project, "backups", "clean-start")) {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(path.join(parent, "tia-"));
  await chmod(directory, 0o700);
  const database = path.join(directory, "tia.db");
  // Explicit fresh target prevents migrate.mjs from loading the project's live .env.
  execFileSync(process.execPath, [path.join(project, "scripts", "migrate.mjs")], {
    cwd: project, windowsHide: true, stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `file:${database.replaceAll("\\", "/")}` },
  });
  await chmod(database, 0o600);
  const check = await inspectEmptyDatabase(database);
  const sha256 = createHash("sha256").update(await readFile(database)).digest("hex");
  const report = {
    createdAt: new Date().toISOString(), directory, database, sha256, ...check,
    accountsCreated: 0, keysCreated: 0, serverStarted: false, productionTouched: false,
    readyForRealData: false,
    requiredBeforeStart: ["approved isolated HTTPS origin", "separate owner-approved authentication secret", "backup schedule and restore", "owner account created by owner"],
  };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  await writeFile(path.join(directory, "SETUP.md"), "# Prepared, not running\n\nEmpty schema only. No account, key or sample data was created. Never copy an existing user's session secret or database into this environment. Follow docs/store/OPERATIONS.md before starting. Keep this directory private and outside Git/Release. Windows ACLs must be checked before real data.\n", { flag: "wx", mode: 0o600 });
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await prepareCleanEnvironment()));
}
