#!/usr/bin/env bash
# Run with PostgreSQL 18 client tools, and a restic repository on Swiss Backup.
set -euo pipefail
umask 077
: "${PGDATABASE:?source database required}" "${CLINKS_CONFIG_DIR:?}" "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
pg_dump --format=custom --file="$stage/clinks.dump"
pg_restore --list "$stage/clinks.dump" > "$stage/archive.list"
restic backup --tag clinks "$stage/clinks.dump" "$CLINKS_CONFIG_DIR"
restic check --read-data-subset=1%
if [[ -n "${BACKUP_STAMP:-}" ]]; then touch -- "$BACKUP_STAMP"; fi
