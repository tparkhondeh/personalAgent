import { expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { inspectEmptyDatabase, prepareCleanEnvironment } from "./prepare-clean-environment.mjs";

it("prepares a fresh empty environment twice without overwriting or creating accounts/keys", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "tia-clean-environment-test-"));
  const first = await prepareCleanEnvironment(parent);
  const before = await readFile(first.database);
  const second = await prepareCleanEnvironment(parent);
  expect(first.directory).not.toBe(second.directory);
  expect(first).toMatchObject({ empty: true, businessTables: 17, readyForRealData: false, accountsCreated: 0, keysCreated: 0, serverStarted: false });
  expect(await readFile(first.database)).toEqual(before);
  expect(await inspectEmptyDatabase(second.database)).toMatchObject({ empty: true });
}, 20000);

it("refuses to label nonempty data as clean and does not remove it", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "tia-nonempty-environment-test-"));
  const environment = await prepareCleanEnvironment(parent);
  const client = createClient({ url: `file:${environment.database.replaceAll("\\", "/")}` });
  // A synthetic marker, not an authentication account or personal information.
  await client.execute("CREATE TABLE qa_marker (id TEXT PRIMARY KEY)");
  await client.execute("INSERT INTO qa_marker VALUES ('retained-synthetic-marker')");
  await expect(inspectEmptyDatabase(environment.database)).rejects.toThrow("not empty");
  expect(Number((await client.execute("SELECT count(*) AS total FROM qa_marker")).rows[0].total)).toBe(1);
  client.close();
}, 20000);
