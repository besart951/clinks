#!/bin/sh
set -eu

if [ "${DATABASE_USER}" = "${POSTGRES_USER}" ]; then
  echo "DATABASE_USER must differ from the PostgreSQL bootstrap superuser" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --set=app_user="${DATABASE_USER}" \
  --set=app_password="${DATABASE_PASSWORD}" \
  --set=db_name="${POSTGRES_DB}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db_name', :'app_user') \gexec
SELECT format('ALTER SCHEMA public OWNER TO %I', :'app_user') \gexec
SQL
