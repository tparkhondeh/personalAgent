#!/usr/bin/env bash
# Benchmark-only workspace. No service, proxy, environment or production changes.
set -Eeuo pipefail
umask 077
base=/home/wealthos_dev/.staging/personal-agent
backup="$base/data/backups/pre-speech-benchmark-20260909"
qa="$base/qa/speech-20260909"
[[ ! -e "$backup" && ! -e "$qa" ]]
mkdir -m 700 "$backup"
cp -p "$base/staging.env" "$backup/staging.env"
readlink -f "$base/current" > "$backup/release.txt"
sqlite3 "$base/data/hamrah-staging.db" ".backup '$backup/hamrah-staging.db'"
[[ "$(sqlite3 "$backup/hamrah-staging.db" 'PRAGMA integrity_check;')" == ok ]]
mkdir -m 700 -p "$qa"
python3.12 -m venv "$qa/venv"
"$qa/venv/bin/python" -m pip install --disable-pip-version-check 'faster-whisper==1.2.1' 'vosk==0.3.45'
printf 'Isolated benchmark prepared. Backup: %s\n' "$backup"
