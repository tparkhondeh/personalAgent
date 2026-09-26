#!/usr/bin/env bash
# Operator-only, append-only snapshots. Never restore over live data or activate a budget copy.
set -euo pipefail
umask 077
# Keep tool errors (which can contain paths or database contents) out of cron logs.
# EXIT also covers explicit exits and failures inside functions/subshells.
exec 3>&2 2>/dev/null
backup_pid=$BASHPID
backup_stage=arguments
backup_log() {
  local timestamp
  TZ=UTC printf -v timestamp '%(%Y-%m-%dT%H:%M:%SZ)T' -1
  printf '%s stage=%s exit_code=%s Tia backup %s\n' "$timestamp" "$backup_stage" "$1" "$2"
}
backup_exit() {
  local code=$?
  if [[ "$BASHPID" == "$backup_pid" && "$code" -ne 0 ]]; then
    backup_log "$code" 'failed; existing data and partial evidence were retained.' >&3
  fi
}
trap backup_exit EXIT

[[ $# -eq 3 ]] || exit 2
backup_stage=dependencies
for required in sqlite3 realpath stat df awk flock mktemp sha256sum cp; do command -v "$required" >/dev/null; done
backup_stage=input-paths
for input in "$@"; do
  [[ "$input" == /* && "$input" != *"'"* && "$input" != *$'\n'* && "$input" != *$'\r'* && ! -L "$input" ]]
done
backup_stage=resolve-paths
app_db=$(realpath -e -- "$1")
budget_db=$(realpath -e -- "$2")
backup_root=$(realpath -e -- "$3")
backup_stage=private-target
[[ -f "$app_db" && -f "$budget_db" && -d "$backup_root" && "$app_db" != "$budget_db" ]]
[[ "$backup_root" != / && "$backup_root" != "$HOME" && "$(stat -c %a "$backup_root")" == 700 ]]
[[ "$(stat -c %u "$backup_root")" == "$(id -u)" ]]
# Do not place snapshots under the application's public/assets directory or inside another snapshot.
[[ "$backup_root" != */public && "$backup_root" != */public/* && "$backup_root" != */assets/* && "$backup_root" != */snapshot-*/* ]]
[[ "$app_db" != "$backup_root/"* && "$budget_db" != "$backup_root/"* ]]
backup_stage=lock
exec 9>"$backup_root/.backup.lock"
flock -n 9

backup_stage=app-schema
app_tables=$(sqlite3 -readonly "$app_db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('User','Task','Meeting');")
[[ "$app_tables" == 3 ]]
backup_stage=budget-schema
budget_tables=$(sqlite3 -readonly "$budget_db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('BudgetMeta','BudgetReceipt','BudgetAuthority');")
[[ "$budget_tables" == 3 ]]

# Two snapshot files plus two restored copies; keep at least 2 GiB available afterwards.
backup_stage=space-estimate
required_bytes=$(( 2147483648 + 4 * ($(stat -c %s "$app_db") + $(stat -c %s "$budget_db")) ))
for wal in "$app_db-wal" "$budget_db-wal"; do
  if [[ -f "$wal" ]]; then required_bytes=$((required_bytes + 4 * $(stat -c %s "$wal"))); fi
done
backup_stage=free-space
free_bytes=$(df -B1 --output=avail "$backup_root" | awk 'NR==2 {print $1}')
backup_stage=space-guard
[[ "$free_bytes" =~ ^[0-9]+$ && "$free_bytes" -gt "$required_bytes" ]]

backup_stage=allocate-snapshot
generation=$(mktemp -d "$backup_root/snapshot-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
mkdir "$generation/restore-check"
check_db() {
  backup_stage="$2-integrity"
  [[ "$(sqlite3 -readonly "$1" 'PRAGMA integrity_check;')" == ok ]]
  backup_stage="$2-foreign-keys"
  [[ -z "$(sqlite3 -readonly "$1" 'PRAGMA foreign_key_check;')" ]]
}
snapshot() {
  local source="$1" name="$2" target="$generation/$2.db"
  backup_stage="$name-snapshot"
  sqlite3 -readonly -cmd '.timeout 10000' "$source" ".backup '$target'"
  backup_stage="$name-permissions"
  chmod 600 "$target"
  check_db "$target" "$name-snapshot"
  # Separate restored files remain inert: no app, scheduler, migration or budget activation.
  backup_stage="$name-restore-copy"
  cp --no-clobber -- "$target" "$generation/restore-check/$name.db"
  check_db "$generation/restore-check/$name.db" "$name-restore"
  backup_stage="$name-restore-hash"
  [[ "$(sha256sum "$target" | awk '{print $1}')" == "$(sha256sum "$generation/restore-check/$name.db" | awk '{print $1}')" ]]
}
snapshot "$app_db" app
snapshot "$budget_db" budget
backup_stage=manifest
(
  cd "$generation"
  sha256sum app.db budget.db restore-check/app.db restore-check/budget.db > SHA256SUMS
  sha256sum --status -c SHA256SUMS
)
backup_stage=verification-record
printf '{"checkedAt":"%s","passed":true,"integrity":"ok","foreignKeyErrors":0,"separateRestoreVerified":true,"encrypted":false,"offHost":false,"liveDataRestored":false,"budgetActivated":false,"previousBackupsDeleted":false}\n' "$(date -u +%FT%TZ)" > "$generation/verified.json"
backup_stage=complete
backup_log 0 'and separate restore check passed.'
