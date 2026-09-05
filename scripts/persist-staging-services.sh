#!/usr/bin/env bash

set -Eeuo pipefail

base="/home/wealthos_dev/.staging/personal-agent"
environment_file="$base/staging.env"
process_name="personal-agent-staging"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$base/data/backups/pre-staging-pm2-$timestamp"
mkdir -m 700 -p "$backup_dir"

cp -p "$environment_file" "$backup_dir/staging.env"
if [[ -f /home/wealthos_dev/.pm2/dump.pm2 ]]; then
  cp -p /home/wealthos_dev/.pm2/dump.pm2 "$backup_dir/dump.pm2"
fi
readlink -f "$base/current" > "$backup_dir/staging-release.txt"
curl -fsS --max-time 5 http://127.0.0.1:3010/api/health > "$backup_dir/health-before.json"
sqlite3 "$base/data/hamrah-staging.db" ".backup '$backup_dir/hamrah-staging.db'"
[[ "$(sqlite3 "$backup_dir/hamrah-staging.db" 'PRAGMA integrity_check;')" == "ok" ]]

old_pid="$(cat "$base/run/app.pid")"
[[ "$old_pid" =~ ^[0-9]+$ ]]
kill "$old_pid"
for _ in {1..30}; do
  if ! kill -0 "$old_pid" 2>/dev/null; then break; fi
  sleep 0.5
done
if kill -0 "$old_pid" 2>/dev/null; then
  echo "The existing staging process did not stop; PM2 migration was canceled." >&2
  exit 1
fi

set -a
source "$environment_file"
set +a
pm2 delete "$process_name" >/dev/null 2>&1 || true
HOSTNAME=127.0.0.1 PORT=3010 pm2 start "$base/current/server.js" \
  --name "$process_name" --cwd "$base/current" --time >/dev/null

healthy=false
for _ in {1..30}; do
  if curl -fsS --max-time 5 http://127.0.0.1:3010/api/health > "$base/run/pm2-health.json" \
    && grep -Fq '"status":"ok"' "$base/run/pm2-health.json" \
    && grep -Fq '"database":"connected"' "$base/run/pm2-health.json"; then
    healthy=true
    break
  fi
  sleep 1
done

if [[ "$healthy" != true ]]; then
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  HOSTNAME=127.0.0.1 PORT=3010 nohup node "$base/current/server.js" \
    > "$base/run/app-pm2-rollback.log" 2>&1 < /dev/null &
  printf '%s\n' "$!" > "$base/run/app.pid"
  echo "PM2 migration failed; staging was restored to the previous launch method." >&2
  exit 1
fi

pm2 pid "$process_name" > "$base/run/app.pid"
pm2 save >/dev/null
printf 'process=%s\nbackup=%s\n' "$process_name" "$backup_dir"
