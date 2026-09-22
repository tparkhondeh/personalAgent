#!/usr/bin/env bash
# Run only in a newly allocated private synthetic directory; all fixtures are retained.
set -euo pipefail
umask 077
[[ $# -eq 2 && -f "$1" && -d "$2" ]]
tool=$(realpath -e "$1")
root=$(realpath -e "$2")
[[ "$(stat -c %a "$root")" == 700 && ! -e "$root/app.db" ]]
sqlite3 "$root/app.db" "CREATE TABLE User(id TEXT PRIMARY KEY); CREATE TABLE Task(id TEXT PRIMARY KEY,userId TEXT REFERENCES User(id),done INTEGER); CREATE TABLE Meeting(id TEXT PRIMARY KEY); INSERT INTO User VALUES('synthetic'); INSERT INTO Task VALUES('test','synthetic',1);"
sqlite3 "$root/budget.db" "CREATE TABLE BudgetMeta(id INTEGER PRIMARY KEY); CREATE TABLE BudgetReceipt(id INTEGER PRIMARY KEY,charged INTEGER); CREATE TABLE BudgetAuthority(id INTEGER PRIMARY KEY); INSERT INTO BudgetReceipt VALUES(1,167986);"
mkdir -m 700 "$root/snapshots" "$root/bad-mode"
chmod 755 "$root/bad-mode"
before=$(sha256sum "$root/app.db" "$root/budget.db")
bash "$tool" "$root/app.db" "$root/budget.db" "$root/snapshots" >/dev/null
bash "$tool" "$root/app.db" "$root/budget.db" "$root/snapshots" >/dev/null
[[ "$(find "$root/snapshots" -name verified.json | wc -l)" -eq 2 ]]
[[ "$before" == "$(sha256sum "$root/app.db" "$root/budget.db")" ]]
for restored in "$root"/snapshots/snapshot-*/restore-check/budget.db; do
  [[ "$(sqlite3 -readonly "$restored" 'SELECT sum(charged) FROM BudgetReceipt;')" == 167986 ]]
done
refused() {
  if bash "$tool" "$@" >/dev/null 2>&1; then echo 'Unexpected unsafe backup acceptance' >&2; exit 1; fi
}
refused "$root/app.db" "$root/budget.db" "$root/bad-mode"
refused "$root/app.db" "$root/app.db" "$root/snapshots"
refused "$root/app.db" "$root/missing.db" "$root/snapshots"
refused "$root/budget.db" "$root/app.db" "$root/snapshots"
ln -s "$root/app.db" "$root/symlink.db"
refused "$root/symlink.db" "$root/budget.db" "$root/snapshots"
(
  exec 8>"$root/snapshots/.backup.lock"
  flock -n 8
  refused "$root/app.db" "$root/budget.db" "$root/snapshots"
)
[[ "$(find "$root/snapshots" -name verified.json | wc -l)" -eq 2 ]]
[[ "$before" == "$(sha256sum "$root/app.db" "$root/budget.db")" ]]
printf '%s\n' '{"passed":true,"syntheticOnly":true,"liveSourceUnchanged":true,"separateRestore":true,"priorBackupsPreserved":true,"budgetReceiptsPreserved":true,"unsafePathsRejected":true,"concurrentRunRejected":true,"fixturesRetained":true}'
