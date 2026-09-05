import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";

if (!process.env.DATABASE_URL) {
  try {
    loadEnvFile();
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const client = createClient({ url });
await client.execute("CREATE TABLE IF NOT EXISTS _hamrah_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");

const migrations = [
  ["20260830170000_init", new URL("../prisma/migrations/20260830170000_init/migration.sql", import.meta.url)],
  ["20260831090000_add_escalation_policy", new URL("../prisma/migrations/20260831090000_add_escalation_policy/migration.sql", import.meta.url)],
  ["20260831100000_add_emergency_contact", new URL("../prisma/migrations/20260831100000_add_emergency_contact/migration.sql", import.meta.url)],
  ["20260905130000_add_multiple_default_reminders", new URL("../prisma/migrations/20260905130000_add_multiple_default_reminders/migration.sql", import.meta.url)],
];

for (const [id, file] of migrations) {
  const existing = await client.execute({ sql: "SELECT id FROM _hamrah_migrations WHERE id = ?", args: [id] });
  if (existing.rows.length) continue;
  const sql = await readFile(file, "utf8");
  await client.executeMultiple(sql);
  await client.execute({ sql: "INSERT INTO _hamrah_migrations (id, applied_at) VALUES (?, ?)", args: [id, new Date().toISOString()] });
  console.log(`Applied migration ${id}`);
}

client.close();
