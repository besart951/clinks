#!/bin/bash
set -euo pipefail
umask 077
cd /srv/clinks
install -d -m 700 config releases
cd config
for name in owner api-password replication-password metadata-password sync-token; do
    if [[ ! -s $name ]]; then openssl rand -hex 32 > "$name"; fi
done
if [[ ! -s storage-key ]]; then openssl rand -base64 32 > storage-key; fi
if [[ ! -s signing.pem ]]; then openssl genpkey -algorithm ED25519 -out signing.pem; fi
python3 - <<'PY'
import base64, json, subprocess
from pathlib import Path
def der(*opts):
    raw = subprocess.check_output(['openssl','pkey','-in','signing.pem','-outform','DER',*opts])
    return base64.urlsafe_b64encode(raw[-32:]).rstrip(b'=').decode()
jwk = dict(kty='OKP', crv='Ed25519', alg='EdDSA', kid='clinks-vps-1', d=der(), x=der('-pubout'))
def secret(name):
    return Path(name).read_text().strip()
url = 'postgres://clinks_api:'+secret('api-password')+'@postgres:5432/clinks'
common = f'DATABASE_URL={url}\nTOKEN_AUDIENCE=clinks\n'
Path('api.base').write_text(common + "SIGNING_KEY='"+json.dumps(jwk)+"'\nSTORAGE_SECRET_KEY="+secret('storage-key')+'\n')
Path('collab.env').write_text(common)
Path('powersync.env').write_text('PS_DATA_SOURCE_URI=postgres://clinks_replication:'+secret('replication-password')+'@postgres:5432/clinks\nPS_STORAGE_SOURCE_URI=postgres://powersync:'+secret('metadata-password')+'@postgres:5432/powersync_storage\nPS_ADMIN_TOKEN='+secret('sync-token')+'\n')
PY
cd ..
docker compose -f db.yml up -d --wait
db=(docker compose -f db.yml exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d clinks)
if ! "${db[@]}" -Atc "SELECT 1 FROM pg_roles WHERE rolname='clinks_api'" | grep -qx 1; then
    "${db[@]}" >/dev/null <<SQL
BEGIN;
CREATE ROLE clinks_app NOLOGIN;
CREATE ROLE clinks_sync NOLOGIN;
CREATE ROLE clinks_api LOGIN PASSWORD '$(cat config/api-password)' IN ROLE clinks_app;
CREATE ROLE clinks_replication LOGIN REPLICATION BYPASSRLS PASSWORD '$(cat config/replication-password)' IN ROLE clinks_sync;
CREATE ROLE powersync LOGIN PASSWORD '$(cat config/metadata-password)';
COMMIT;
SQL
fi
if ! "${db[@]}" -Atc "SELECT 1 FROM pg_database WHERE datname='powersync_storage'" | grep -qx 1; then
    "${db[@]}" -c 'CREATE DATABASE powersync_storage OWNER powersync'
fi
docker network inspect clinks-ingress >/dev/null 2>&1 || docker network create clinks-ingress
