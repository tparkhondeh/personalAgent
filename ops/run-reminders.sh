#!/bin/bash
set -eu

APP_ROOT="${PERSONAL_AGENT_ROOT:-/home/wealthos_dev/apps/personal-agent}"
set -a
. "$APP_ROOT/shared/.env"
set +a

# Send the secret over stdin so it is not visible in the process list.
printf 'request = "POST"\nheader = "Authorization: Bearer %s"\nsilent\nshow-error\nfail\n' "$CRON_SECRET" \
  | curl --config - --url "http://127.0.0.1:${PORT:-3011}/api/internal/reminders"
