#!/bin/sh
set -eu

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY is required}"
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD is required}"
: "${PGHOST:?PGHOST is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

backup_file="$(mktemp /tmp/clinks-postgres-XXXXXX.dump)"
cleanup() { rm -f "$backup_file"; }
trap cleanup EXIT INT TERM

pg_dump --format=custom --no-owner --no-privileges --file="$backup_file"
restic snapshots >/dev/null 2>&1 || restic init
restic backup --tag clinks --tag postgresql "$backup_file"
restic forget --tag clinks --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
