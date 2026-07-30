#!/bin/sh
set -eu

: "${API_IMAGE:?API_IMAGE is required}"
: "${WEB_IMAGE:?WEB_IMAGE is required}"
: "${BACKUP_IMAGE:?BACKUP_IMAGE is required}"

cd /opt/clinks
export API_IMAGE WEB_IMAGE BACKUP_IMAGE

docker compose --env-file .env -f docker-compose.production.yml pull
docker compose --env-file .env -f docker-compose.production.yml run --rm migrate
docker compose --env-file .env -f docker-compose.production.yml up -d --remove-orphans api worker nginx
docker compose --env-file .env -f docker-compose.production.yml ps --status running api worker nginx
