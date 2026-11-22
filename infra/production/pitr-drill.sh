#!/usr/bin/env bash
# Exercise the archive and replay with disposable synthetic data inside an isolated PostgreSQL 18 container.
set -euo pipefail
docker run --rm -i --network none --user postgres --entrypoint bash postgres:18.7 -es <<'DRILL'
set -eu
stage=$(mktemp -d)
mkdir "$stage/sock" "$stage/wal"
initdb -D "$stage/source" --auth-local=trust >/dev/null
cat >>"$stage/source/postgresql.conf" <<CONF
listen_addresses=''
unix_socket_directories='$stage/sock'
wal_level=logical
archive_mode=on
archive_command='test -f $stage/wal/%f || cp %p $stage/wal/%f'
CONF
pg_ctl -D "$stage/source" -l "$stage/source.log" start >/dev/null
export PGHOST="$stage/sock" PGUSER=postgres PGDATABASE=postgres
psql -Xq -v ON_ERROR_STOP=1 -c 'CREATE TABLE drill_marker(id integer PRIMARY KEY)'
pg_basebackup --checkpoint=fast --pgdata="$stage/recovery" --wal-method=stream
psql -Xq -v ON_ERROR_STOP=1 -c 'INSERT INTO drill_marker VALUES (1)'
psql -Xq -v ON_ERROR_STOP=1 -c "SELECT pg_create_restore_point('clinks_restore_test')"
psql -Xq -v ON_ERROR_STOP=1 -c 'INSERT INTO drill_marker VALUES (2)'
psql -Xq -v ON_ERROR_STOP=1 -c 'SELECT pg_switch_wal()'
pg_ctl -D "$stage/source" -m fast stop >/dev/null
cat >>"$stage/recovery/postgresql.conf" <<CONF
archive_mode=off
restore_command='cp $stage/wal/%f %p'
recovery_target_name='clinks_restore_test'
recovery_target_action='promote'
CONF
touch "$stage/recovery/recovery.signal"
pg_ctl -D "$stage/recovery" -l "$stage/recovery.log" start >/dev/null
test "$(psql -XAt -c 'SELECT array_agg(id ORDER BY id) FROM drill_marker')" = '{1}'
pg_ctl -D "$stage/recovery" -m fast stop >/dev/null
echo 'WAL replay reached the named restore point and excluded the later transaction.'
DRILL
