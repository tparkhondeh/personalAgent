import "dotenv/config";
import { createClient } from "@libsql/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/data/hamrah.db";
if (!databaseUrl.startsWith("file:")) throw new Error("Remote databases must use the provider backup facility.");

const backupDirectory = path.resolve(process.cwd(), "backups", "local");
await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupPath = path.join(backupDirectory, `hamrah-${timestamp}.db`);
const sqlPath = backupPath.replaceAll("\\", "/").replaceAll("'", "''");

const source = createClient({ url: databaseUrl });
await source.execute(`VACUUM INTO '${sqlPath}'`);
source.close();

const snapshot = createClient({ url: `file:${backupPath}` });
const integrity = await snapshot.execute("PRAGMA integrity_check");
snapshot.close();
const result = String(integrity.rows[0]?.integrity_check ?? "unknown");
if (result !== "ok") throw new Error(`Backup integrity check failed: ${result}`);

await writeFile(`${backupPath}.json`, JSON.stringify({ createdAt: new Date().toISOString(), integrity: result, encrypted: false }, null, 2));
console.log(`Backup created and verified: ${backupPath}`);
