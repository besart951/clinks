#!/usr/bin/env bash
# PGHOST/PGUSER/PGPASSFILE refer to the isolated test cluster; never restore into an existing database.
set -euo pipefail
umask 077
dump=${1:?path to a restored pg_dump archive}
test -r "$dump"
drill="clinks_drill_$(date +%s)_${RANDOM}"
createdb --template=template0 "$drill"
trap 'dropdb --if-exists "$drill"' EXIT
pg_restore --exit-on-error --single-transaction --dbname="$drill" "$dump"
psql -X --set ON_ERROR_STOP=1 --dbname="$drill" <<'SQL'
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name='0009_sync_access.sql')
 OR EXISTS (SELECT 1 FROM pg_publication_tables WHERE schemaname='auth')
 OR NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='powersync' AND tablename='contacts')
 OR NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid='contacts'::regclass)
 OR NOT has_table_privilege('clinks_api','contacts','SELECT, INSERT, UPDATE, DELETE')
 THEN RAISE EXCEPTION 'restored schema, publication or application privileges are incomplete'; END IF;
END $$;
SELECT count(*) AS tenants FROM tenants;
SELECT count(*) AS credentials FROM auth.credentials;
SET ROLE clinks_api;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM contacts) OR EXISTS (SELECT 1 FROM document_versions)
 THEN RAISE EXCEPTION 'unscoped API could read restored tenant records'; END IF;
END $$;
SQL
