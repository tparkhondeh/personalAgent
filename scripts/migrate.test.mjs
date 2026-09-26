import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { applyMigration } from "./migrate.mjs";

// Real libsql transaction connections outlive close() on Windows. A short child
// process releases their handles before removing the *synthetic-only* directory.
async function scenario(body) {
  const directory = await mkdtemp(join(tmpdir(), "tia-migrate-regression-"));
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import {createClient} from '@libsql/client';
      import {readdir,readFile} from 'node:fs/promises';
      import {applyMigration} from ${JSON.stringify(new URL("./migrate.mjs", import.meta.url).href)};
      const db=createClient({url:${JSON.stringify(`file:${join(directory, "synthetic.db").replaceAll("\\", "/")}`)}});
      try { ${body} } finally { db.close(); }
    `], { encoding: "utf8", timeout: 10000, windowsHide: true });
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  } finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith("tia-migrate-regression-")) throw Error("Unsafe synthetic cleanup target");
    await rm(directory, { recursive: true, force: true });
  }
}

it("imports without loading environment/data and rolls back partial DDL before a safe retry", async () => {
  expect(typeof applyMigration).toBe("function");
  await scenario(`
    await db.executeMultiple("CREATE TABLE Example(id TEXT PRIMARY KEY); INSERT INTO Example VALUES('preserved');");
    await assert.rejects(applyMigration(db,'partial',"ALTER TABLE Example ADD COLUMN added TEXT; INSERT INTO missing_table VALUES(1);"));
    assert.deepEqual((await db.execute('PRAGMA table_info(Example)')).rows.map(r=>r.name),['id']);
    assert.equal((await db.execute('SELECT * FROM Example')).rows[0].id,'preserved');
    assert.equal(await applyMigration(db,'partial','ALTER TABLE Example ADD COLUMN added TEXT;'),true);
    assert.equal(await applyMigration(db,'partial','ALTER TABLE Example ADD COLUMN added TEXT;'),false);
  `);
});

it("all six real migrations preserve existing data/FKs, roll back a lost receipt, and replay once", async () => {
  await scenario(`
    const directory = new URL(${JSON.stringify(new URL("../prisma/migrations/", import.meta.url).href)});
    const names=(await readdir(directory,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
    assert.equal(names.length,6);
    await db.execute('PRAGMA foreign_keys=ON');
    for(const [index,id] of names.entries()) {
      const sql=await readFile(new URL(id+'/migration.sql',directory),'utf8');
      if(index===5) {
        await db.execute("UPDATE Meeting SET status='DONE',alertPolicy='synthetic-preserved-policy'");
        const before=(await db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name")).rows;
        const failReceipt={async transaction(mode) {
          const tx=await db.transaction(mode);
          return new Proxy(tx,{get(target,key) {
            if(key==='execute') return async stmt=>{if(typeof stmt!=='string'&&stmt.sql.startsWith('INSERT INTO _hamrah_migrations')) throw Error('synthetic receipt failure'); return target.execute(stmt);};
            const value=Reflect.get(target,key); return typeof value==='function'?value.bind(target):value;
          }});
        }};
        await assert.rejects(applyMigration(failReceipt,id,sql),/synthetic receipt failure/);
        assert.deepEqual((await db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name")).rows,before);
        assert.equal((await db.execute('SELECT count(*) AS n FROM _hamrah_migrations')).rows[0].n,5);
      }
      assert.equal(await applyMigration(db,id,sql),true);
      if(index===0) {
        await db.execute("INSERT INTO User(id,name,email,updatedAt) VALUES('owner','Synthetic','fixture@example.invalid',CURRENT_TIMESTAMP)");
        await db.execute("INSERT INTO Task(id,userId,title,status,updatedAt) VALUES('task','owner','Preserved task','DONE',CURRENT_TIMESTAMP)");
        await db.execute("INSERT INTO Meeting(id,userId,title,startsAt,endsAt,updatedAt) VALUES('meeting','owner','Preserved meeting','2026-09-20T12:00:00Z','2026-09-20T13:00:00Z',CURRENT_TIMESTAMP)");
        await db.execute("INSERT INTO CalendarEvent(id,title,startsAt,endsAt,meetingId) VALUES('calendar','Preserved calendar','2026-09-20T12:00:00Z','2026-09-20T13:00:00Z','meeting')");
        await db.execute("INSERT INTO Reminder(id,userId,taskId,scheduledFor,status,idempotencyKey) VALUES('receipt','owner','task','2026-09-20T11:00:00Z','SENT','synthetic-receipt')");
      }
    }
    const preserved={};
    for(const name of ['User','Task','Meeting','CalendarEvent','Reminder','_hamrah_migrations']) preserved[name]=(await db.execute('SELECT * FROM '+name)).rows;
    for(const id of names) assert.equal(await applyMigration(db,id,await readFile(new URL(id+'/migration.sql',directory),'utf8')),false);
    for(const [name,rows] of Object.entries(preserved)) assert.deepEqual((await db.execute('SELECT * FROM '+name)).rows,rows);
    assert.equal(preserved.Meeting[0].status,'DONE'); assert.equal(preserved.Meeting[0].priority,'IMPORTANT');
    assert.equal(preserved.Meeting[0].alertPolicy,'synthetic-preserved-policy'); assert.equal(preserved.Reminder[0].status,'SENT');
    assert.equal((await db.execute('PRAGMA foreign_key_check')).rows.length,0);
    assert.equal((await db.execute('PRAGMA foreign_keys')).rows[0].foreign_keys,1);
  `);
});
