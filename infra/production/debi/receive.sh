#!/bin/bash
set -euo pipefail
umask 077
cd /srv/clinks
[[ $# == 2 && $2 =~ ^[0-9a-f]{40}$ ]] || exit 2
mode=$1
export RELEASE=$2
export CONFIG_DIR="/srv/clinks/releases/$RELEASE/config"
install -d -m 700 "$CONFIG_DIR"
exec 9>/srv/clinks/release.lock
flock 9
if [[ $mode == providers ]]; then
    tmp=$(mktemp "$CONFIG_DIR/providers.XXXX")
    trap 'rm -f "$tmp"' EXIT
    cat > "$tmp"
    python3 - "$tmp" <<'PY'
import sys
from pathlib import Path
required = set('S3_ENDPOINT S3_BUCKET S3_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY SMTP_URL MAIL_FROM'.split())
allowed = required | set('SMTP_RELAY_URL INBOUND_IMAP_URL STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICES STRIPE_TAX'.split())
seen = set()
for line in Path(sys.argv[1]).read_text().splitlines():
    if not line.strip() or line.startswith('#'):
        continue
    key, sep, value = line.partition('=')
    if not sep or key not in allowed or key in seen or not value.strip():
        sys.exit('Invalid or duplicate provider setting')
    seen.add(key)
if required - seen:
    sys.exit('Missing settings: ' + ', '.join(sorted(required - seen)))
PY
    cat config/api.base "$tmp" > "$CONFIG_DIR/api.env.next"
    mv "$CONFIG_DIR/api.env.next" "$CONFIG_DIR/api.env"
    cp config/{collab,powersync}.env "$CONFIG_DIR/"
    exit
fi
[[ $mode == release && -s "$CONFIG_DIR/api.env" ]] || exit 2
if [[ ! -d repository.git ]]; then git init --bare -q repository.git; fi
git --git-dir=repository.git fetch -q --depth=1 https://github.com/besart951/clinks.git refs/heads/main
[[ $(git --git-dir=repository.git rev-parse FETCH_HEAD) == "$RELEASE" ]] || { echo 'Push superseded'; exit 1; }
source_dir="/srv/clinks/releases/$RELEASE/source"
mkdir -p "$source_dir"
git --git-dir=repository.git archive "$RELEASE" infra | tar -x -C "$source_dir"
docker load
docker image inspect "clinks-workspace:$RELEASE" "clinks-edge:$RELEASE" >/dev/null
cd "$source_dir/infra/production"
. debi/hosts.sh
python3 debi/configure-origins.py
sed 's/sslmode: verify-full/sslmode: disable/g' powersync.yaml > /srv/clinks/config/powersync.yaml
chmod 644 /srv/clinks/config/powersync.yaml
chmod 644 ../powersync/sync-config.yaml
compose=(docker compose -p clinks-live -f compose.yml -f debi/vps.yml)
"${compose[@]}" config -q
for name in "$WEB_HOST" "$API_HOST" "$SYNC_HOST" "$COLLAB_HOST"; do
    getent ahostsv4 "$name" | awk '{print $1}' | grep -Fx 83.228.246.96 >/dev/null || { echo "DNS missing: $name"; exit 1; }
done
export DATABASE_OWNER_URL="postgres://postgres:$(cat /srv/clinks/config/owner)@postgres:5432/clinks"
docker run --rm --network clinks-database -e DATABASE_OWNER_URL "clinks-workspace:$RELEASE" node packages/db/src/migrate.ts
unset DATABASE_OWNER_URL
"${compose[@]}" up -d --no-build --wait api collab
"${compose[@]}" up -d --no-build --no-deps caddy
curl --fail --retry 6 --retry-all-errors "https://$API_HOST/.well-known/jwks.json" -o /dev/null
"${compose[@]}" up -d --no-build --wait --wait-timeout 180
expected=$(docker exec clinks-live-caddy-1 sha256sum /srv/index.html | cut -d' ' -f1)
for attempt in {1..10}; do
    actual=$(curl -fsS "https://$WEB_HOST/" | sha256sum | cut -d' ' -f1)
    [[ $actual == "$expected" ]] && break
    sleep 1
done
[[ $actual == "$expected" ]] || { echo 'Public home page differs from release'; exit 1; }
curl -fsS "https://$WEB_HOST/besmir/login" | grep -F 'Login | PlanerLink' >/dev/null
ln -sfn "$source_dir" /srv/clinks/current
