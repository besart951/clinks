# Production operations

The VPS stores only `/opt/clinks/docker-compose.production.yml`, the Nginx template, TLS files, the deployment script, and a `0600` `/opt/clinks/.env`. Application source code is never checked out there; releases pull immutable GHCR image digests.

## Initial VPS setup

1. Create `/opt/clinks`, copy `deploy/.env.production.example` to `/opt/clinks/.env`, fill every secret, and run `chmod 0600 /opt/clinks/.env`.
2. Put the certificate and private key at `/opt/clinks/tls/fullchain.pem` and `/opt/clinks/tls/privkey.pem`, readable only by the Docker operator.
3. Point `admin`, `planer`, `infra`, and `api` DNS records at the VPS. Register the exact Google callback URL only after `api.DOMAIN_PLACEHOLDER` has been replaced.
4. Grant the GitHub deploy key access only to the deployment account and pre-populate its `known_hosts` entry in GitHub Actions.
5. Copy the two files in `deploy/systemd/` to `/etc/systemd/system/`, then run `systemctl enable --now clinks-backup.timer`.

## Releases

Only a `v*` tag publishes and deploys. The workflow builds API, worker, web/Nginx, and backup images, scans the API and web images, uploads only deployment configuration to the VPS, migrates once, and starts API, worker, and Nginx with immutable image digests.

After a release, check `https://api.DOMAIN_PLACEHOLDER/healthz` and `/readyz`, create a test invitation, and verify its worker job reaches `completed`.

## Backups and restore drills

The timer creates daily encrypted `pg_dump` archives with Restic in the configured S3-compatible bucket. Once a month, restore one archive into an isolated PostgreSQL instance and run a read-only smoke check:

```sh
restic snapshots --tag clinks
restic restore latest --target /tmp/clinks-restore
pg_restore --dbname=postgres://restore_user:restore_password@isolated-db:5432/clinks_restore /tmp/clinks-restore/tmp/*.dump
```

Record the date, selected snapshot, restore duration, and smoke-check result with the deployment record. Never restore a drill into production.
