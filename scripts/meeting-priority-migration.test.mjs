import { expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";

it("adds meeting priority without changing existing identity, time, completion or alert policy", async () => {
  const db = createClient({ url: "file::memory:" });
  try {
    await db.executeMultiple('CREATE TABLE Meeting (id TEXT PRIMARY KEY, title TEXT, startsAt TEXT, status TEXT, alertPolicy TEXT);');
    await db.execute({ sql: "INSERT INTO Meeting VALUES (?,?,?,?,?)", args: ["existing", "جلسه قبلی", "2026-09-16T13:30:00Z", "DONE", '{"channels":["IN_APP"]}'] });
    const before = (await db.execute("SELECT * FROM Meeting")).rows[0];
    await db.executeMultiple(await readFile("prisma/migrations/20260916070000_meeting_priority/migration.sql", "utf8"));
    const { priority, ...after } = (await db.execute("SELECT * FROM Meeting")).rows[0];
    expect(priority).toBe("IMPORTANT"); expect(after).toEqual(before);
    await db.execute("UPDATE Meeting SET priority='NORMAL'");
    expect((await db.execute("SELECT priority FROM Meeting")).rows[0].priority).toBe("NORMAL");
  } finally { db.close(); }
});
