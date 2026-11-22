#!/usr/bin/env bash
# Run from the private monitoring host. Exit status integrates with the operator's alert transport.
set -euo pipefail
: "${API_HEALTH_URL:?}" "${SYNC_HEALTH_URL:?}" "${PGDATABASE:?}" "${BACKUP_STAMP:?}"
curl --fail --silent --max-time 10 "$API_HEALTH_URL" >/dev/null
curl --fail --silent --max-time 10 "$SYNC_HEALTH_URL" >/dev/null
psql -Xq --set ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_replication_slots WHERE database=current_database() AND slot_type='logical')
 OR EXISTS (SELECT 1 FROM pg_replication_slots WHERE database=current_database() AND slot_type='logical'
 AND (NOT active OR pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)>268435456))
 THEN RAISE EXCEPTION 'logical replication missing, inactive or over 256 MiB behind'; END IF;
 IF (SELECT count(*) FROM audit WHERE action IN ('auth.locked','auth.sign_in_failed') AND created_at>now()-interval '5 minutes')>=20
 THEN RAISE EXCEPTION 'high failed sign-in rate'; END IF;
END $$;
SQL
if ! test -f "$BACKUP_STAMP" || ! find "$BACKUP_STAMP" -mmin -1560 -print -quit | grep -q .; then
  echo 'No successful backup in the last 26 hours' >&2
  exit 1
fi
if [[ -n "${COMPOSE_FILE:-}" ]]; then
  recent=$(docker compose logs --no-color --since 5m api)
  if [[ "$recent" == *'"event":"billing.webhook_failed"'* ]]; then
    echo 'Stripe webhook failures in the last five minutes' >&2
    exit 1
  fi
fi
