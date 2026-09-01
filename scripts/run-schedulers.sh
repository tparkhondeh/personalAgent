#!/usr/bin/env bash
set -euo pipefail

: "${APP_ORIGIN:?APP_ORIGIN must be an internal origin such as http://127.0.0.1:3010}"
: "${CRON_SECRET:?CRON_SECRET is required}"

case "$APP_ORIGIN" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    echo "APP_ORIGIN must remain on the local server interface" >&2
    exit 1
    ;;
esac

for endpoint in reminders escalations; do
  curl \
    --fail \
    --silent \
    --show-error \
    --request POST \
    --header "Authorization: Bearer ${CRON_SECRET}" \
    "${APP_ORIGIN}/api/internal/${endpoint}"
  printf '\n'
done
