#!/usr/bin/env bash

set -Eeuo pipefail

action="${1:-prepare}"
staging_root="/home/wealthos_dev/.staging/personal-agent"
runtime_root="$staging_root/stable-https"
backup_root="$staging_root/data/backups"
database="$staging_root/data/hamrah-staging.db"
proxy_source="/home/wealthos_dev/.staging/personal-agent/staging-https-proxy.mjs"
process_name="personal-agent-staging-https"

if [[ "$action" == "stop" ]]; then
  pm2 delete "$process_name" >/dev/null 2>&1 || true
  echo "Stable staging HTTPS proxy stopped. Production was not touched."
  exit 0
fi

if ss -ltn | awk '{print $4}' | grep -Eq '(^|:)8443$'; then
  echo "Port 8443 is already in use; refusing to overwrite it." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$backup_root/pre-stable-https-$timestamp"
mkdir -p "$backup_dir" "$runtime_root"

readlink -f "$staging_root/current" > "$backup_dir/staging-release.txt" 2>/dev/null || true
ss -ltnp > "$backup_dir/listeners.txt" 2>/dev/null || true
pm2 jlist > "$backup_dir/pm2-before.json"
curl -fsS --max-time 10 http://127.0.0.1:3010/api/health > "$backup_dir/staging-health.json"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$database" ".backup '$backup_dir/hamrah-staging.db'"
  sqlite3 "$backup_dir/hamrah-staging.db" "PRAGMA integrity_check;" | grep -Fxq ok
else
  cp -p "$database" "$backup_dir/hamrah-staging.db"
fi
sha256sum "$backup_dir/hamrah-staging.db" > "$backup_dir/SHA256SUMS.txt"

openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
  -keyout "$runtime_root/origin.key" -out "$runtime_root/origin.crt" \
  -subj "/CN=personalagent.wealthos.ir" >/dev/null 2>&1
chmod 600 "$runtime_root/origin.key"

STAGING_LISTEN_HOST=0.0.0.0 \
STAGING_LISTEN_PORT=8443 \
STAGING_TARGET_HOST=127.0.0.1 \
STAGING_TARGET_PORT=3010 \
STAGING_TLS_KEY="$runtime_root/origin.key" \
STAGING_TLS_CERT="$runtime_root/origin.crt" \
pm2 start "$proxy_source" --name "$process_name" --time >/dev/null

for attempt in {1..20}; do
  if curl -kfsS --max-time 5 https://127.0.0.1:8443/api/health > "$runtime_root/local-health.json"; then
    grep -Fq '"status":"ok"' "$runtime_root/local-health.json"
    echo "Stable staging HTTPS proxy is healthy. Backup: $backup_dir"
    exit 0
  fi
  sleep 1
done

pm2 delete "$process_name" >/dev/null 2>&1 || true
echo "Stable staging HTTPS proxy failed its local health check and was rolled back." >&2
exit 1
