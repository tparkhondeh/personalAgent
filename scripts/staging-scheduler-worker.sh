#!/usr/bin/env bash
# A dedicated staging-only PM2 worker. No Production cron or process is changed.
set -Eeuo pipefail
umask 077
base=/home/wealthos_dev/.staging/personal-agent
[[ -f "$base/staging.env" ]]
set -a
source "$base/staging.env"
set +a
: "${CRON_SECRET:?Staging scheduler secret is required}"
# This preview worker must not start if live external escalation was enabled.
[[ "${OUTBOUND_CALLS_MODE:-mock}" != live ]]
forbidden_header=$'\n'
[[ "$CRON_SECRET" != *"$forbidden_header"* && "$CRON_SECRET" != *$'\r'* ]]
while true; do
  for endpoint in reminders escalations; do
    # Keep credentials off command-line arguments and never emit response bodies.
    if printf 'Authorization: Bearer %s\n' "$CRON_SECRET" | curl \
      --fail --silent --show-error --max-time 20 --request POST --header @- \
      --output /dev/null "http://127.0.0.1:3010/api/internal/$endpoint"; then
      printf '%s staging-%s ok\n' "$(date -u +%FT%TZ)" "$endpoint"
    else
      printf '%s staging-%s failed; will retry next cycle\n' "$(date -u +%FT%TZ)" "$endpoint" >&2
    fi
  done
  sleep 60
done
