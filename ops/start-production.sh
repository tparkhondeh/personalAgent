#!/bin/bash
set -eu

APP_ROOT="${PERSONAL_AGENT_ROOT:-/home/wealthos_dev/apps/personal-agent}"
cd "$APP_ROOT/current"
set -a
. "$APP_ROOT/shared/.env"
set +a
exec node server.js
