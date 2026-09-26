import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

const migrations = [
  ["20260830170000_init", new URL("../prisma/migrations/20260830170000_init/migration.sql", import.meta.url)],
  ["20260831090000_add_escalation_policy", new URL("../prisma/migrations/20260831090000_add_escalation_policy/migration.sql", import.meta.url)],
  ["20260831100000_add_emergency_contact", new URL("../prisma/migrations/20260831100000_add_emergency_contact/migration.sql", import.meta.url)],
  ["20260905130000_add_multiple_default_reminders", new URL("../prisma/migrations/20260905130000_add_multiple_default_reminders/migration.sql", import.meta.url)],
  ["20260906041000_confirmed_agent", new URL("../prisma/migrations/20260906041000_confirmed_agent/migration.sql", import.meta.url)],
  ["20260916070000_meeting_priority", new URL("../prisma/migrations/20260916070000_meeting_priority/migration.sql", import.meta.url)],
];

export async function applyMigration(client, id, sql) {
  const tx = await client.transaction("write");
  try {
    await tx.execute("CREATE TABLE IF NOT EXISTS _hamrah_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const existing = await tx.execute({ sql: "SELECT id FROM _hamrah_migrations WHERE id = ?", args: [id] });
    if (!existing.rows.length) {
      await tx.executeMultiple(sql);
      await tx.execute({ sql: "INSERT INTO _hamrah_migrations (id, applied_at) VALUES (?, ?)", args: [id, new Date().toISOString()] });
    }
    // Schema and receipt commit together. Never retry an uncertain commit here.
    await tx.commit();
    return !existing.rows.length;
  } finally {
    try { if (!tx.closed) await tx.rollback(); }
    finally { tx.close(); }
  }
}

// Importing the transaction helper in synthetic tests never loads .env or opens a DB.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) {
    try { loadEnvFile(); }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = createClient({ url });
  try {
    for (const [id, file] of migrations) {
      if (await applyMigration(client, id, await readFile(file, "utf8"))) console.log(`Applied migration ${id}`);
    }
  } finally { client.close(); }
}
