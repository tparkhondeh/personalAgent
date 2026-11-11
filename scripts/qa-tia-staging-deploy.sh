#!/usr/bin/env bash
# Synthetic SQLite integration tests. Never point this harness at live data.
set -euo pipefail
umask 077
[[ $# -eq 3 && -f "$1" && -f "$2" && -d "$3" ]]
tool=$(realpath -e "$1")
helper=$(realpath -e "$2")
root=$(realpath -e "$3")
[[ "$(stat -c %a "$root")" == 700 && ! -e "$root/cases" ]]
mkdir "$root/cases"
old=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
candidate=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export QA_OLD="$old" QA_CANDIDATE="$candidate" QA_MODE=success

make_case() {
  case_dir="$root/cases/$1"
  base="$case_dir/staging"
  mkdir -p "$base/data/backups" "$base/releases/$old" "$case_dir/tools" "$case_dir/pm2" "$case_dir/package/scripts"
  sqlite3 "$base/data/hamrah-staging.db" "PRAGMA foreign_keys=ON; CREATE TABLE User(id TEXT PRIMARY KEY); CREATE TABLE Task(id TEXT PRIMARY KEY,userId TEXT REFERENCES User(id),done INTEGER); CREATE TABLE Meeting(id TEXT PRIMARY KEY); INSERT INTO User VALUES('synthetic'); INSERT INTO Task VALUES('saved','synthetic',1),('pending','synthetic',0);"
  sqlite3 "$base/data/budget.db" "CREATE TABLE BudgetMeta(id INTEGER PRIMARY KEY); CREATE TABLE BudgetAuthority(id INTEGER PRIMARY KEY); CREATE TABLE BudgetReceipt(id INTEGER PRIMARY KEY,charged INTEGER,reserved INTEGER,status TEXT); INSERT INTO BudgetReceipt VALUES(1,167986,0,'SETTLED'),(2,0,970,'UNKNOWN');"
  printf 'DATABASE_URL="file:%s/data/hamrah-staging.db"\nOPENAI_BUDGET_DATABASE_FILE="%s/data/budget.db"\n' "$base" "$base" > "$base/staging.env"
  printf '[]\n' > "$case_dir/pm2/dump.pm2"
  printf '%s\n' "$old" > "$base/releases/$old/BUILD_COMMIT.txt"
  ln -s "$base/releases/$old" "$base/current"
  printf '%s\n' "$candidate" > "$case_dir/package/BUILD_COMMIT.txt"
  printf '// Synthetic migration is handled by the node function.\n' > "$case_dir/package/scripts/migrate.mjs"
  tar -czf "$case_dir/candidate.tar.gz" -C "$case_dir/package" .
  archive_hash=$(sha256sum "$case_dir/candidate.tar.gz" | awk '{print $1}')
  # Rewrite ONLY the two fixed deployment paths in a disposable test copy.
  sed -e "s@^base=/home/wealthos_dev/.staging/personal-agent\$@base=$base@" \
    -e "s@/home/wealthos_dev/.pm2/dump.pm2@$case_dir/pm2/dump.pm2@g" "$tool" > "$case_dir/tools/deploy.sh"
  ! grep -q '/home/wealthos_dev/' "$case_dir/tools/deploy.sh"
  cp "$helper" "$case_dir/tools/backup-tia-staging.sh"
  export QA_CASE_DIR="$case_dir" QA_MODE=success
  budget_before=$(sha256sum "$base/data/budget.db")
  receipts_before=$(sqlite3 -readonly "$base/data/budget.db" 'SELECT id,charged,reserved,status FROM BudgetReceipt ORDER BY id;')
}

pm2() {
  case "$1" in
    jlist)
      if [[ -f "$QA_CASE_DIR/stopped" ]]; then
        printf '[{"name":"personal-agent-staging-scheduler","pid":0,"pm2_env":{"status":"stopped"}}]\n'
      else
        printf '[{"name":"personal-agent-staging-scheduler","pid":123,"pm2_env":{"status":"online"}}]\n'
      fi ;;
    stop)
      printf 'stop\n' >> "$QA_CASE_DIR/process.log"
      [[ "$QA_MODE" != stop-fail ]] || return 41
      if [[ "$QA_MODE" != stop-lies ]]; then touch "$QA_CASE_DIR/stopped"; fi ;;
    restart) printf 'restart:%s\n' "$APP_BUILD_COMMIT" >> "$QA_CASE_DIR/process.log" ;;
    save) printf 'save\n' >> "$QA_CASE_DIR/process.log" ;;
    *) return 90 ;;
  esac
}
node() {
  if [[ "$1" == -e ]]; then
    # A bare return inside ERR handling can inherit the triggering error status.
    local verifier_status=0
    command node "$@" || verifier_status=$?
    return "$verifier_status"
  fi
  # Migration is allowed only after BOTH snapshots and independent restores pass.
  local snapshot
  snapshot=$(find "$QA_CASE_DIR/staging/data/backups" -name verified.json -print)
  [[ -n "$snapshot" && "$(printf '%s\n' "$snapshot" | wc -l)" == 1 ]] || { echo 'Synthetic assertion: both restored snapshots required' >&2; return 91; }
  [[ -f "$(dirname "$snapshot")/restore-check/app.db" && -f "$(dirname "$snapshot")/restore-check/budget.db" ]] || return 92
  printf 'migration:%s\n' "$DATABASE_URL" >> "$QA_CASE_DIR/process.log"
  [[ "$QA_MODE" != migration-fail ]] || return 42
  sqlite3 "${DATABASE_URL#file:}" 'CREATE TABLE IF NOT EXISTS MigrationAudit(id INTEGER PRIMARY KEY); INSERT OR IGNORE INTO MigrationAudit VALUES(1);'
  if [[ "$QA_MODE" == migration-bad-fk ]]; then
    sqlite3 "${DATABASE_URL#file:}" "INSERT INTO Task VALUES('invalid','missing-owner',0);"
  fi
}
curl() {
  local current
  current=$(basename "$(readlink -f "$QA_CASE_DIR/staging/current")")
  if [[ "$QA_MODE" != success && "$current" == "$QA_CANDIDATE" && ! -f "$QA_CASE_DIR/after-snapshot-write" ]]; then
    sqlite3 "$QA_CASE_DIR/staging/data/budget.db" "INSERT INTO BudgetReceipt VALUES(3,0,431,'UNKNOWN');"
    sqlite3 "$QA_CASE_DIR/staging/data/hamrah-staging.db" "INSERT INTO Task VALUES('after-snapshot','synthetic',0);"
    touch "$QA_CASE_DIR/after-snapshot-write"
  fi
  if [[ "$QA_MODE" == wrong-health-commit ]]; then
    printf '{"status":"ok","database":"connected","buildCommit":"wrong"}\n'
    return 0
  fi
  if [[ "$QA_MODE" != success && ( "$current" != "$QA_OLD" || "$QA_MODE" != rollback ) ]]; then return 28; fi
  printf '{"status":"ok","database":"connected","buildCommit":"%s"}\n' "$current"
}
sleep() { :; }
cp() {
  if [[ "$QA_MODE" == restore-fail && "${!#}" == */restore-check/budget.db ]]; then return 48; fi
  command cp "$@"
}
df() {
  if [[ "$QA_MODE" == low-space && "$1" == -B1 ]]; then printf 'Avail\n0\n'; else command df "$@"; fi
}
sqlite3() {
  if [[ "$QA_MODE" == migration-fk-command-fail && "$1" == */migration-check.db && "${!#}" == 'PRAGMA foreign_key_check;' ]]; then return 49; fi
  command sqlite3 "$@"
}
export -f pm2 node curl sleep cp df sqlite3

run_deploy() { bash "$case_dir/tools/deploy.sh" "$case_dir/candidate.tar.gz" "$archive_hash" "$candidate" > "$case_dir/output.log" 2>&1; }
refused() { if run_deploy; then echo 'Unsafe synthetic deployment accepted' >&2; exit 1; fi; }
unchanged_budget() {
  if [[ -f "$case_dir/after-snapshot-write" ]]; then
    [[ "$receipts_before" == "$(sqlite3 -readonly "$base/data/budget.db" 'SELECT id,charged,reserved,status FROM BudgetReceipt WHERE id<=2 ORDER BY id;')" ]]
    [[ "$(sqlite3 -readonly "$base/data/budget.db" 'SELECT reserved FROM BudgetReceipt WHERE id=3 AND status="UNKNOWN";')" == 431 ]]
    [[ "$(sqlite3 -readonly "$base/data/budget.db" 'SELECT count(*) FROM BudgetReceipt;')" == 3 ]]
    [[ "$(sqlite3 -readonly "$base/data/hamrah-staging.db" 'SELECT count(*) FROM Task WHERE id="after-snapshot";')" == 1 ]]
  else
    [[ "$budget_before" == "$(sha256sum "$base/data/budget.db")" ]]
  fi
  [[ "$(sqlite3 -readonly "$base/data/budget.db" 'SELECT reserved FROM BudgetReceipt WHERE id=2 AND status="UNKNOWN";')" == 970 ]]
  [[ "$(sqlite3 -readonly "$base/data/hamrah-staging.db" 'SELECT sum(done) FROM Task;')" == 1 ]]
}
no_switch() {
  [[ "$(readlink -f "$base/current")" == "$base/releases/$old" ]]
  [[ ! -f "$case_dir/process.log" ]]
  unchanged_budget
}

make_case success
run_deploy
[[ "$(readlink -f "$base/current")" == "$base/releases/$candidate" ]]
[[ "$(find "$base/data/backups" -name verified.json | wc -l)" == 1 ]]
[[ "$(sqlite3 -readonly "$base/data/hamrah-staging.db" 'SELECT count(*) FROM MigrationAudit;')" == 1 ]]
unchanged_budget
process_before=$(sha256sum "$case_dir/process.log")
refused
[[ "$process_before" == "$(sha256sum "$case_dir/process.log")" ]]
[[ "$(find "$base/data/backups" -name verified.json | wc -l)" == 1 ]]
unchanged_budget

make_case missing-ledger
printf 'DATABASE_URL="file:%s/data/hamrah-staging.db"\nOPENAI_BUDGET_DATABASE_FILE="%s/data/missing.db"\n' "$base" "$base" > "$base/staging.env"
refused
no_switch

make_case invalid-ledger
sqlite3 "$base/data/invalid.db" 'CREATE TABLE Unrelated(id INTEGER);'
printf 'DATABASE_URL="file:%s/data/hamrah-staging.db"\nOPENAI_BUDGET_DATABASE_FILE="%s/data/invalid.db"\n' "$base" "$base" > "$base/staging.env"
refused
no_switch

make_case restore-fail
export QA_MODE=restore-fail
refused
no_switch

make_case low-space
export QA_MODE=low-space
refused
no_switch

make_case concurrent
(
 exec 7>"$base/.deployment.lock"
 flock -n 7
 refused
 no_switch
)

make_case migration-fail
export QA_MODE=migration-fail
refused
[[ "$(readlink -f "$base/current")" == "$base/releases/$old" ]]
! grep -q '^restart:' "$case_dir/process.log"
unchanged_budget

for mode in migration-bad-fk migration-fk-command-fail; do
 make_case "$mode"
 export QA_MODE="$mode"
 refused
 [[ "$(readlink -f "$base/current")" == "$base/releases/$old" ]]
 ! grep -q '^restart:' "$case_dir/process.log"
 unchanged_budget
done

make_case rollback
export QA_MODE=rollback
refused
[[ "$(readlink -f "$base/current")" == "$base/releases/$old" && -f "$case_dir/stopped" ]]
grep -q 'Staging rolled back' "$case_dir/output.log"
[[ "$(sqlite3 -readonly "$base/data/hamrah-staging.db" 'SELECT count(*) FROM MigrationAudit;')" == 1 ]]
unchanged_budget

for mode in stop-fail stop-lies rollback-unhealthy wrong-health-commit; do
 make_case "$mode"
 export QA_MODE="$mode"
 refused
 ! grep -q 'Staging rolled back' "$case_dir/output.log"
 if [[ "$mode" == rollback-unhealthy || "$mode" == wrong-health-commit ]]; then
   grep -q 'rollback health FAILED' "$case_dir/output.log"
   [[ "$(readlink -f "$base/current")" == "$base/releases/$old" ]]
 else
   grep -q 'rollback BLOCKED' "$case_dir/output.log"
   [[ "$(readlink -f "$base/current")" == "$base/releases/$candidate" ]]
   ! grep -q "^restart:$old" "$case_dir/process.log"
 fi
 unchanged_budget
done
printf '%s\n' '{"passed":true,"cases":14,"syntheticOnly":true,"realSQLite":true,"processControlsMocked":true,"separateRestoresRequired":true,"missingInvalidLedgerRejected":true,"restoreFailureRejected":true,"deploymentLockRequired":true,"retryRejected":true,"migrationFailureNoSwitch":true,"schedulerStopVerified":true,"rollbackHealthVerified":true,"newDataAndUnknownSpendPreserved":true,"postSnapshotWritesPreserved":true,"foreignKeyCommandFailureRejected":true,"foreignKeyViolationsRejected":true,"wrongHealthCommitRejected":true,"fixturesRetained":true}'
