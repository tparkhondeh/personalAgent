#!/usr/bin/env bash

set -Eeuo pipefail

base="/home/wealthos_dev/.staging/personal-agent"
environment_file="$base/staging.env"
database="$base/data/hamrah-staging.db"
origin="https://personalagent.wealthos.ir:8443"

start_staging() {
  set -a
  source "$environment_file"
  set +a
  HOSTNAME=127.0.0.1 PORT=3010 nohup node "$base/current/server.js" \
    > "$base/run/app-stable-origin.log" 2>&1 < /dev/null &
  printf '%s\n' "$!" > "$base/run/app.pid"
}

stop_staging() {
  local pid
  pid="$(cat "$base/run/app.pid")"
  [[ "$pid" =~ ^[0-9]+$ ]]
  kill "$pid"
  for _ in {1..30}; do
    if ! kill -0 "$pid" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  echo "Staging process did not stop; no configuration was changed." >&2
  exit 1
}

wait_for_health() {
  for _ in {1..30}; do
    if curl -fsS --max-time 5 http://127.0.0.1:3010/api/health > "$base/run/stable-origin-health.json" \
      && grep -Fq '"status":"ok"' "$base/run/stable-origin-health.json" \
      && grep -Fq '"database":"connected"' "$base/run/stable-origin-health.json"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

action="${1:-configure}"
if [[ "$action" == "rollback" ]]; then
  backup_dir="${2:-}"
  [[ "$backup_dir" == "$base/data/backups/pre-staging-origin-"* ]]
  [[ -f "$backup_dir/staging.env" ]]
  stop_staging
  cp -p "$backup_dir/staging.env" "$environment_file"
  start_staging
  wait_for_health
  echo "Staging origin configuration rolled back from $backup_dir"
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$base/data/backups/pre-staging-origin-$timestamp"
mkdir -m 700 -p "$backup_dir"
cp -p "$environment_file" "$backup_dir/staging.env"
readlink -f "$base/current" > "$backup_dir/staging-release.txt"
curl -fsS --max-time 5 http://127.0.0.1:3010/api/health > "$backup_dir/health-before.json"
sqlite3 "$database" ".backup '$backup_dir/hamrah-staging.db'"
[[ "$(sqlite3 "$backup_dir/hamrah-staging.db" 'PRAGMA integrity_check;')" == "ok" ]]
sha256sum "$backup_dir/hamrah-staging.db" > "$backup_dir/SHA256SUMS.txt"

stop_staging
sed -i -E "s#^BETTER_AUTH_URL=.*#BETTER_AUTH_URL=$origin#" "$environment_file"
start_staging

if ! wait_for_health; then
  failed_pid="$(cat "$base/run/app.pid")"
  kill "$failed_pid" 2>/dev/null || true
  cp -p "$backup_dir/staging.env" "$environment_file"
  start_staging
  wait_for_health || true
  echo "New staging origin failed; the previous environment was restored." >&2
  exit 1
fi

printf 'origin=%s\nbackup=%s\n' "$origin" "$backup_dir"
