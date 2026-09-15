// Explicit local operator action only; never called by an HTTP request.
import { open, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
const file = process.argv[2], seed = Number(process.argv[3]);
const parent = file ? await realpath(path.dirname(file)) : "";
const relative = path.relative(process.cwd(), parent);
if (!file || !path.isAbsolute(file) || !file.endsWith(".db") || !(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) || !Number.isSafeInteger(seed) || seed < 0 || seed > 2_000_000 || !(await stat(parent)).isDirectory()) throw new Error("Require fresh private absolute .db and reviewed prior-spend microUSD");
const handle = await open(file, "wx", 0o600); await handle.close();
const db = createClient({ url: `file:${file.replaceAll("\\", "/")}` });
try {
  await db.executeMultiple(await readFile("scripts/ai-monthly-schema.sql", "utf8"));
  const now = new Date().toISOString(), period = now.slice(0, 7);
  await db.batch([
    { sql: "INSERT INTO BudgetMeta VALUES(1,1,2000000,?,0)", args: [period] },
    { sql: "INSERT INTO BudgetReceipt(id,month,charged,settled,createdAt) VALUES('reviewed-prior-spend',?,?,1,?)", args: [period, seed, now] },
  ], "write");
  const integrity = (await db.execute("PRAGMA integrity_check")).rows[0].integrity_check;
  if (integrity !== "ok") throw new Error("Budget integrity check failed");
  console.log(JSON.stringify({ initialized: true, monthlyLimitUsd: 2, priorReservedMicroUsd: seed, period, integrity }));
} finally { db.close(); }
