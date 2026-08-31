#!/bin/sh
set -eu
node scripts/migrate.mjs
node server.js
