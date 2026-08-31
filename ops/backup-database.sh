#!/bin/bash
set -eu

APP_ROOT="${PERSONAL_AGENT_ROOT:-/home/wealthos_dev/apps/personal-agent}"
set -a
. "$APP_ROOT/shared/.env"
set +a

DB_PATH="${DATABASE_URL#file:}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$APP_ROOT/shared/backups/hamrah-$STAMP.db"

sqlite3 "$DB_PATH" ".timeout 5000" ".backup '$OUTPUT'"
chmod 600 "$OUTPUT"
find "$APP_ROOT/shared/backups" -maxdepth 1 -type f -name 'hamrah-*.db' -mtime +30 -delete
