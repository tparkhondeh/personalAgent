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
timestamp_pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z '
private_marker='SYNTHETIC_PRIVATE_ERROR /synthetic/private/database.db'
check_output() {
  local output="$1" stage="$2" code="$3" message="$4"
  [[ "$output" =~ $timestamp_pattern ]]
  [[ "$output" == *" stage=$stage exit_code=$code Tia backup $message" ]]
  [[ "$output" != *$'\n'* && "$output" != *"$root"* && "$output" != *"$private_marker"* ]]
}
succeeded() {
  local output
  output=$(bash "$tool" "$root/app.db" "$root/budget.db" "$root/snapshots" 2>&1)
  check_output "$output" complete 0 'and separate restore check passed.'
}
succeeded
succeeded
[[ "$(find "$root/snapshots" -name verified.json | wc -l)" -eq 2 ]]
[[ "$before" == "$(sha256sum "$root/app.db" "$root/budget.db")" ]]
for restored in "$root"/snapshots/snapshot-*/restore-check/budget.db; do
  [[ "$(sqlite3 -readonly "$restored" 'SELECT sum(charged) FROM BudgetReceipt;')" == 167986 ]]
done
refused() {
  local stage="$1" expected_code="$2" output code
  shift 2
  if output=$(bash "$tool" "$@" 2>&1); then echo 'Unexpected unsafe backup acceptance' >&2; exit 1; else code=$?; fi
  [[ "$code" == "$expected_code" ]]
  check_output "$output" "$stage" "$code" 'failed; existing data and partial evidence were retained.'
}
refused arguments 2
refused private-target 1 "$root/app.db" "$root/budget.db" "$root/bad-mode"
refused private-target 1 "$root/app.db" "$root/app.db" "$root/snapshots"
refused resolve-paths 1 "$root/app.db" "$root/missing.db" "$root/snapshots"
refused app-schema 1 "$root/budget.db" "$root/app.db" "$root/snapshots"
ln -s "$root/app.db" "$root/symlink.db"
refused input-paths 1 "$root/symlink.db" "$root/budget.db" "$root/snapshots"
(
  exec 8>"$root/snapshots/.backup.lock"
  flock -n 8
  refused lock 1 "$root/app.db" "$root/budget.db" "$root/snapshots"
)
# Deterministic low-space and noisy-tool failures; never fill a real filesystem.
(
  df() { printf 'Avail\n0\n'; }; export -f df
  refused space-guard 1 "$root/app.db" "$root/budget.db" "$root/snapshots"
)
(
  sqlite3() { printf '%s\n' 'SYNTHETIC_PRIVATE_ERROR /synthetic/private/database.db' >&2; return 47; }; export -f sqlite3
  refused app-schema 47 "$root/app.db" "$root/budget.db" "$root/snapshots"
)
(
  cp() { printf '%s\n' 'SYNTHETIC_PRIVATE_ERROR /synthetic/private/database.db' >&2; return 48; }; export -f cp
  refused app-restore-copy 48 "$root/app.db" "$root/budget.db" "$root/snapshots"
)
[[ "$(find "$root/snapshots" -name verified.json | wc -l)" -eq 2 ]]
[[ "$(find "$root/snapshots" -maxdepth 1 -type d -name 'snapshot-*' | wc -l)" -eq 3 ]]
# A failure keeps its partial generation and does not prevent the next safe run.
succeeded
[[ "$(find "$root/snapshots" -name verified.json | wc -l)" -eq 3 ]]
[[ "$(find "$root/snapshots" -maxdepth 1 -type d -name 'snapshot-*' | wc -l)" -eq 4 ]]
for verified in "$root"/snapshots/snapshot-*/verified.json; do
  generation=$(dirname "$verified")
  (cd "$generation" && sha256sum --status -c SHA256SUMS)
  [[ "$(sqlite3 -readonly "$generation/restore-check/app.db" 'SELECT done FROM Task;')" == 1 ]]
  [[ "$(sqlite3 -readonly "$generation/restore-check/budget.db" 'SELECT sum(charged) FROM BudgetReceipt;')" == 167986 ]]
done
[[ "$before" == "$(sha256sum "$root/app.db" "$root/budget.db")" ]]
printf '%s\n' '{"passed":true,"syntheticOnly":true,"liveSourceUnchanged":true,"separateRestore":true,"priorBackupsPreserved":true,"budgetReceiptsPreserved":true,"unsafePathsRejected":true,"concurrentRunRejected":true,"spaceGuardPreserved":true,"failureDiagnostics":true,"privateOutputSuppressed":true,"partialEvidenceRetained":true,"fixturesRetained":true}'
