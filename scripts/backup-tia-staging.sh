#!/usr/bin/env bash
# Operator-only, append-only snapshots. Never restore over live data or activate a budget copy.
set -euo pipefail
umask 077
trap 'printf "%s\n" "Tia backup failed; existing data and partial evidence were retained." >&2' ERR

[[ $# -eq 3 ]] || { echo 'Usage: backup-tia-staging.sh APP_DB BUDGET_DB PRIVATE_BACKUP_ROOT' >&2; exit 2; }
for required in sqlite3 realpath stat df awk flock mktemp sha256sum cp; do command -v "$required" >/dev/null; done
for input in "$@"; do
  [[ "$input" == /* && "$input" != *"'"* && "$input" != *$'\n'* && "$input" != *$'\r'* && ! -L "$input" ]]
done
app_db=$(realpath -e -- "$1")
budget_db=$(realpath -e -- "$2")
backup_root=$(realpath -e -- "$3")
[[ -f "$app_db" && -f "$budget_db" && -d "$backup_root" && "$app_db" != "$budget_db" ]]
[[ "$backup_root" != / && "$backup_root" != "$HOME" && "$(stat -c %a "$backup_root")" == 700 ]]
[[ "$(stat -c %u "$backup_root")" == "$(id -u)" ]]
# Do not place snapshots under the application's public/assets directory or inside another snapshot.
[[ "$backup_root" != */public && "$backup_root" != */public/* && "$backup_root" != */assets/* && "$backup_root" != */snapshot-*/* ]]
[[ "$app_db" != "$backup_root/"* && "$budget_db" != "$backup_root/"* ]]
exec 9>"$backup_root/.backup.lock"
flock -n 9

app_tables=$(sqlite3 -readonly "$app_db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('User','Task','Meeting');")
budget_tables=$(sqlite3 -readonly "$budget_db" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('BudgetMeta','BudgetReceipt','BudgetAuthority');")
[[ "$app_tables" == 3 && "$budget_tables" == 3 ]]

# Two snapshot files plus two restored copies; keep at least 2 GiB available afterwards.
required_bytes=$(( 2147483648 + 4 * ($(stat -c %s "$app_db") + $(stat -c %s "$budget_db")) ))
for wal in "$app_db-wal" "$budget_db-wal"; do
  if [[ -f "$wal" ]]; then required_bytes=$((required_bytes + 4 * $(stat -c %s "$wal"))); fi
done
free_bytes=$(df -B1 --output=avail "$backup_root" | awk 'NR==2 {print $1}')
[[ "$free_bytes" =~ ^[0-9]+$ && "$free_bytes" -gt "$required_bytes" ]]

generation=$(mktemp -d "$backup_root/snapshot-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
mkdir "$generation/restore-check"
check_db() {
  [[ "$(sqlite3 -readonly "$1" 'PRAGMA integrity_check;')" == ok ]]
  [[ -z "$(sqlite3 -readonly "$1" 'PRAGMA foreign_key_check;')" ]]
}
snapshot() {
  local source="$1" name="$2" target="$generation/$2.db"
  sqlite3 -readonly -cmd '.timeout 10000' "$source" ".backup '$target'"
  chmod 600 "$target"
  check_db "$target"
  # Separate restored files remain inert: no app, scheduler, migration or budget activation.
  cp --no-clobber -- "$target" "$generation/restore-check/$name.db"
  check_db "$generation/restore-check/$name.db"
  [[ "$(sha256sum "$target" | awk '{print $1}')" == "$(sha256sum "$generation/restore-check/$name.db" | awk '{print $1}')" ]]
}
snapshot "$app_db" app
snapshot "$budget_db" budget
(
  cd "$generation"
  sha256sum app.db budget.db restore-check/app.db restore-check/budget.db > SHA256SUMS
  sha256sum --status -c SHA256SUMS
)
printf '{"checkedAt":"%s","passed":true,"integrity":"ok","foreignKeyErrors":0,"separateRestoreVerified":true,"encrypted":false,"offHost":false,"liveDataRestored":false,"budgetActivated":false,"previousBackupsDeleted":false}\n' "$(date -u +%FT%TZ)" > "$generation/verified.json"
printf 'Tia backup and separate restore check passed: %s\n' "$generation"
