import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const tool = readFileSync("scripts/backup-tia-staging.sh", "utf8").replaceAll("\r\n", "\n");
const qa = readFileSync("scripts/qa-tia-staging-backup.sh", "utf8").replaceAll("\r\n", "\n");
const boundary = tool.indexOf("\n[[ $# -eq 3 ]]");
if (boundary < 0) throw Error("Backup argument boundary not found");
// Execute the real diagnostic boundary with controlled failing commands. No DB,
// backup, environment file or server is opened; Linux QA covers the full restore.
const diagnostics = tool.slice(0, boundary);
function bashExecutable() {
  if (process.platform !== "win32") return "bash";
  const located = spawnSync("where.exe", ["git.exe"], { encoding: "utf8", windowsHide: true });
  const candidates = (located.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).flatMap(git => {
    const root = path.resolve(path.dirname(git), "..");
    return [path.join(root, "bin/bash.exe"), path.join(root, "usr/bin/bash.exe"), path.join(root, "usr/bin/sh.exe")];
  });
  const executable = candidates.find(existsSync);
  if (!executable) throw Error("Bash (including Git's Bash-compatible sh) is required for backup diagnostic tests");
  return executable;
}
const bash = bashExecutable();
function run(source: string, syntaxOnly = false) {
  const before = Date.now();
  const result = spawnSync(bash, ["--noprofile", "--norc", ...(syntaxOnly ? ["-n"] : []), "-s"], {
    input: source, encoding: "utf8", timeout: 5000, maxBuffer: 128 * 1024, windowsHide: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "test", TZ: "Pacific/Honolulu" },
  });
  if (result.error) throw result.error;
  return { ...result, before, after: Date.now() };
}
function expectFailure(result: ReturnType<typeof run>, stage: string, code: number) {
  expect(result.status).toBe(code);
  expect(result.stdout).toBe("");
  const lines = result.stderr.trim().split("\n");
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z stage=${stage} exit_code=${code} Tia backup failed; existing data and partial evidence were retained\\.$`));
  const timestamp = Date.parse(lines[0].split(" ")[0]);
  expect(timestamp).toBeGreaterThanOrEqual(result.before - 1000);
  expect(timestamp).toBeLessThanOrEqual(result.after);
  expect(result.stderr).not.toContain("SYNTHETIC_PRIVATE");
  expect(result.stderr).not.toContain("/private/");
}

describe("bounded backup diagnostics", () => {
  it("parses the production backup and its full Linux restore regression", () => {
    for (const source of [tool, qa]) {
      const result = run(source, true);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    }
  });
  it("reports an explicit argument rejection in UTC with the original exit code", () => {
    expectFailure(run(tool), "arguments", 2);
  });
  it("suppresses raw tool errors and reports a failure inside a function", () => {
    expectFailure(run(`${diagnostics}
backup_stage=app-restore-copy
copy_fixture() { printf '%s\\n' 'SYNTHETIC_PRIVATE token /private/database.db' >&2; return 48; }
copy_fixture
`), "app-restore-copy", 48);
  });
  it("reports a command-substitution failure once, without paths or data", () => {
    expectFailure(run(`${diagnostics}
backup_stage=app-schema
app_tables=$(printf '%s\\n' 'SYNTHETIC_PRIVATE /private/database.db' >&2; exit 47)
`), "app-schema", 47);
  });
  it("reports a pipeline failure inside a subshell once", () => {
    expectFailure(run(`${diagnostics}
backup_stage=manifest
(printf '%s\\n' 'SYNTHETIC_PRIVATE /private/snapshot' >&2; false | :)
`), "manifest", 1);
  });
  it("keeps successful diagnostics path-free and does not emit a failure", () => {
    const result = run(`${diagnostics}
backup_stage=complete
backup_log 0 'and separate restore check passed.'
`);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z stage=complete exit_code=0 Tia backup and separate restore check passed\.\n$/);
  });
});
