#!/usr/bin/env bash
# Deploy only the isolated staging service; keep all previous releases and data.
set -Eeuo pipefail
umask 077
archive="${1:?Archive path required}"
expected_hash="${2:?SHA-256 required}"
commit="${3:?Full commit required}"
[[ "$commit" =~ ^[a-f0-9]{40}$ && "$expected_hash" =~ ^[a-f0-9]{64}$ ]]
base=/home/wealthos_dev/.staging/personal-agent
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
backup="$base/data/backups/pre-release-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 -p "$backup"
cp -p "$base/staging.env" "$backup/staging.env"
pm2 jlist > "$backup/processes.json"
cp -p /home/wealthos_dev/.pm2/dump.pm2 "$backup/dump.pm2"
printf '%s\n' "$previous" > "$backup/release.txt"
sqlite3 "$database" ".backup '$backup/hamrah-staging.db'"
[[ "$(sqlite3 "$backup/hamrah-staging.db" 'PRAGMA integrity_check;')" == ok ]]
mkdir -m 700 "$release"
tar -xzf "$archive" -C "$release"
[[ "$(cat "$release/BUILD_COMMIT.txt")" == "$commit" ]]
set -a
source "$base/staging.env"
set +a
[[ "$DATABASE_URL" == "file:$database" ]]
cp -p "$backup/hamrah-staging.db" "$backup/migration-check.db"
DATABASE_URL="file:$backup/migration-check.db" node "$release/scripts/migrate.mjs"
[[ "$(sqlite3 "$backup/migration-check.db" 'PRAGMA integrity_check;')" == ok ]]
# Migrations are additive. Rolling back code must not restore an old DB over
# new user data. Older code does not understand per-item approval policies;
# pause the staging scheduler during rollback until a forward fix is ready.
node "$release/scripts/migrate.mjs"
switch_release() {
  local target="$1"
  local link="$base/current-next-$(date -u +%s%N)"
  ln -s "$target" "$link"
  mv -Tf "$link" "$base/current"
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
  pm2 stop personal-agent-staging-scheduler >/dev/null || true
  switch_release "$previous"
  pm2 save >/dev/null
  echo "Staging rolled back to $previous; backup: $backup" >&2
  exit 1
}
trap rollback ERR
switch_release "$release"
healthy=false
for attempt in {1..30}; do
  if curl -fsS --max-time 3 http://127.0.0.1:3010/api/health > "$backup/health-after.json" \
    && grep -Fq "$commit" "$backup/health-after.json"; then healthy=true; break; fi
  sleep 1
done
[[ "$healthy" == true ]]
pm2 save >/dev/null
trap - ERR
printf 'commit=%s\nbackup=%s\nrollback_release=%s\n' "$commit" "$backup" "$previous"
