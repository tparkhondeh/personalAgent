#!/usr/bin/env bash
# Deploy only the isolated staging service; keep all previous releases and data.
set -Eeuo pipefail
umask 077
[[ $# -eq 3 ]]
operator_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
backup_tool="$operator_dir/backup-tia-staging.sh"
[[ -f "$backup_tool" ]]
archive="${1:?Archive path required}"
expected_hash="${2:?SHA-256 required}"
commit="${3:?Full commit required}"
[[ "$commit" =~ ^[a-f0-9]{40}$ && "$expected_hash" =~ ^[a-f0-9]{64}$ ]]
base=/home/wealthos_dev/.staging/personal-agent
# Serialize the whole release, not just a single database snapshot.
exec 8>"$base/.deployment.lock"
flock -n 8
database="$base/data/hamrah-staging.db"
release="$base/releases/$commit"
[[ "$(readlink -f "$database")" == "$database" ]]
[[ "$(sha256sum "$archive" | cut -d ' ' -f 1)" == "$expected_hash" ]]
[[ ! -e "$release" ]]
[[ "$(df -Pk "$base" | awk 'NR==2 {print $4}')" -gt 524288 ]]
if tar -tzf "$archive" | grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)\.env($|\.)|\.(jks|keystore)$)'; then
  echo 'Unsafe server archive'; exit 1
fi
previous="$(readlink -f "$base/current")"
[[ "$previous" == "$base/releases/"* ]]
previous_commit="$(basename "$previous")"
[[ "$previous_commit" =~ ^[a-f0-9]{40}$ ]]
# Read only the existing configuration; never initialize or move the cost ledger.
set -a
source "$base/staging.env"
set +a
[[ "$DATABASE_URL" == "file:$database" ]]
[[ -n "${OPENAI_BUDGET_DATABASE_FILE:-}" ]]
backup="$(mktemp -d "$base/data/backups/pre-release-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
# The operator-side helper checks both databases and independent restored copies.
# Fail before migrations/service changes if either source or restore is invalid.
bash "$backup_tool" "$database" "$OPENAI_BUDGET_DATABASE_FILE" "$backup"
mapfile -t snapshots < <(find "$backup" -mindepth 1 -maxdepth 1 -type d -name 'snapshot-*')
[[ ${#snapshots[@]} -eq 1 && -f "${snapshots[0]}/verified.json" ]]
cp --no-clobber -- "${snapshots[0]}/app.db" "$backup/hamrah-staging.db"
cp -p "$base/staging.env" "$backup/staging.env"
pm2 jlist > "$backup/processes.json"
cp -p /home/wealthos_dev/.pm2/dump.pm2 "$backup/dump.pm2"
printf '%s\n' "$previous" > "$backup/release.txt"
mkdir -m 700 "$release"
tar -xzf "$archive" -C "$release"
[[ "$(cat "$release/BUILD_COMMIT.txt")" == "$commit" ]]
cp -p "$backup/hamrah-staging.db" "$backup/migration-check.db"
DATABASE_URL="file:$backup/migration-check.db" node "$release/scripts/migrate.mjs"
[[ "$(sqlite3 "$backup/migration-check.db" 'PRAGMA integrity_check;')" == ok ]]
migration_fk_errors=$(sqlite3 "$backup/migration-check.db" 'PRAGMA foreign_key_check;')
[[ -z "$migration_fk_errors" ]]
# Migrations are additive. Rolling back code must not restore an old DB over
# new user data. Older code does not understand per-item approval policies;
# pause the staging scheduler during rollback until a forward fix is ready.
node "$release/scripts/migrate.mjs"
wait_for_health() {
  local expected="$1" record="$2"
  for attempt in {1..30}; do
    if curl -fsS --max-time 3 http://127.0.0.1:3010/api/health > "$record" \
      && node -e 'const fs=require("node:fs"); try {const h=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(h.status!=="ok" || h.database!=="connected" || h.buildCommit!==process.argv[2]) process.exit(1);} catch {process.exit(1);}' "$record" "$expected"; then
      return 0
    fi
    sleep 1
  done
  return 1
}
switch_release() {
  local target="$1"
  local link="$base/current-next-$(date -u +%s%N)"
  ln -s "$target" "$link" || return 1
  mv -Tf "$link" "$base/current" || return 1
  if [[ -f "$target/BUILD_COMMIT.txt" ]]; then
    export APP_BUILD_COMMIT="$(cat "$target/BUILD_COMMIT.txt")"
  else
    export APP_BUILD_COMMIT="$(basename "$target")"
  fi
  export HOSTNAME=127.0.0.1 PORT=3010
  pm2 restart personal-agent-staging --update-env >/dev/null
}
rollback() {
  trap - ERR
  # Do not run old code with a scheduler that may still execute newer policies.
  if ! pm2 stop personal-agent-staging-scheduler >/dev/null; then
    echo 'Staging rollback BLOCKED: scheduler stop failed; operator action required.' >&2
    exit 1
  fi
  if ! pm2 jlist > "$backup/scheduler-stop.json" \
    || ! node -e 'const fs=require("node:fs"); try {const rows=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).filter(p=>p.name==="personal-agent-staging-scheduler"); if(rows.length>1 || rows.some(p=>p.pm2_env?.status!=="stopped" || Number(p.pid)>0)) process.exit(1);} catch {process.exit(1);}' "$backup/scheduler-stop.json"; then
    echo 'Staging rollback BLOCKED: scheduler stop not confirmed; operator action required.' >&2
    exit 1
  fi
  if ! switch_release "$previous"; then
    echo 'Staging rollback restart FAILED; operator action required.' >&2
    exit 1
  fi
  if ! wait_for_health "$previous_commit" "$backup/health-rollback.json"; then
    echo 'Staging rollback health FAILED; operator action required.' >&2
    exit 1
  fi
  if ! pm2 save >/dev/null; then
    echo 'Staging rollback persistence FAILED; operator action required.' >&2
    exit 1
  fi
  echo "Staging rolled back to $previous; scheduler paused; backup: $backup" >&2
  exit 1
}
trap rollback ERR
switch_release "$release"
wait_for_health "$commit" "$backup/health-after.json"
pm2 save >/dev/null
trap - ERR
printf 'commit=%s\nbackup=%s\nrollback_release=%s\n' "$commit" "$backup" "$previous"
