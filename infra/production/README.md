# Production handover

The deployment runs the static workspace behind Caddy, the Node API, Hocuspocus and PowerSync. PostgreSQL, object storage, SMTP and the backup repository are external dependencies. The local drills use synthetic data. Provisioning a live tenant requires an operator and the provider accounts.

## Network and database

1. With OpenTofu and an Infomaniak OpenStack project, initialise `cloud/` and run `tofu plan` with the provider network, image, flavour, SSH key and management CIDR. Review costs, region and remote state storage before applying. Only the edge exposes HTTP/HTTPS and management SSH. Install Docker Compose on the edge and restrict database access to the private network.
2. Confirm with the managed PostgreSQL provider that logical replication slots, publications, a replication login that reads the tenant rows under forced RLS, and PITR are supported. Otherwise provision PostgreSQL 18 independently, enable logical replication and configure continuous WAL archiving to separate durable storage. Verify replay before putting data in service.
3. Apply migrations with the migration owner using `DATABASE_OWNER_URL` and `pnpm db:migrate`. Provision login `clinks_api` as a member of `clinks_app` without ownership, superuser or BYPASSRLS. Use a separate replication credential for PowerSync. Grant it SELECT only on the published tables and the privileges needed for logical replication across tenants. Deny access to the auth schema. Provision a separate writable PowerSync metadata database. Use verified TLS and install the provider CA in the services' trust stores if necessary.
4. Put DNS names for the four HTTPS services under the same registrable domain. Keep private environment files outside the checkout. Supply `CONFIG_DIR` (absolute), `RELEASE`, `WEB_HOST`, `API_HOST`, `SYNC_HOST` and `COLLAB_HOST` to Compose. Validate with `docker compose -f infra/production/compose.yml config -q`. Build the release with `docker compose -f infra/production/compose.yml build`, then deploy the reviewed images. Keep the Caddy data volume across releases.

| Private file  | Settings                                                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| api.env       | DATABASE_URL for clinks_api, WEB_ORIGIN (public HTTPS), TOKEN_ISSUER (public API), TOKEN_AUDIENCE=clinks, SIGNING_KEY from the API keys command, PREVIOUS_PUBLIC_KEYS during rotation, SMTP_URL, MAIL_FROM, object and billing variables below |
| collab.env    | Same restricted DATABASE_URL, TOKEN_ISSUER and TOKEN_AUDIENCE. JWKS_URL points to the public API's /.well-known/jwks.json                                                                                                                      |
| powersync.env | PS_DATA_SOURCE_URI (replication login), PS_STORAGE_SOURCE_URI (metadata database), PS_JWKS_URI (public HTTPS JWKS) and a random PS_ADMIN_TOKEN                                                                                                 |

## Private document storage

Set S3_ENDPOINT to the browser-reachable HTTPS endpoint, S3_BUCKET, S3_REGION and AWS credentials for the SDK. Restrict the runtime principal to the document bucket and the operations in `object-store.ts`. Use a separate provisioning principal to run `node apps/api/src/init-bucket.ts` with WEB_ORIGIN, S3_LOCK_MODE and the approved S3_RETENTION_DAYS. The command creates a lock-enabled bucket or configures an existing lock-enabled one and checks its lock configuration. Confirm provider support for the selected lock mode, checksums, CORS and versioned GET before importing real documents. COMPLIANCE retention can prevent deletion even by the owner.

Optional S3_NONCURRENT_DAYS adds a lifecycle rule for noncurrent objects explicitly tagged `retention=released` and incomplete multipart uploads. Keep referenced historical versions available for restore. Protect the object versions and back them up independently of the database archive, which contains version references.

## Billing

Provision sandbox products with `STRIPE_SECRET_KEY` and `node apps/api/src/billing-catalog.ts`. Set its JSON output as STRIPE_PRICES in api.env, alongside the matching secret and STRIPE_WEBHOOK_SECRET. Enable the Customer Portal and configure the endpoint `/webhooks/stripe` for checkout.session.completed, customer.subscription events and invoice.payment_failed. The API checks the raw signature, customer binding, configured CHF price, interval and current subscription. Plan changes update the tenant once per event. Active membership count sets the checkout quantity. Reconcile seat changes before invoicing.

The six prices cover monthly and annual seat subscriptions for the three plans. Module entitlements follow the plan. Separately priced modules need approved rates. Enable STRIPE_TAX only after configuring registrations and tax treatment in Stripe. Confirm supported payment methods for the merchant and subscription model in the sandbox before enabling live billing. Stripe excludes B2B payments from TWINT eligibility. [Stripe TWINT](https://docs.stripe.com/payments/twint)

## Backup, restore and alerting

Use PostgreSQL 18 client tools and restic on the backup host. Provide PGHOST, PGPORT, PGUSER, PGDATABASE and PGPASSFILE for a backup role able to read every tenant and auth row. Configure RESTIC_REPOSITORY for Swiss Backup, RESTIC_PASSWORD_FILE and the transport credentials. Escrow recovery credentials separately. Set CLINKS_CONFIG_DIR to the protected deployment configuration and BACKUP_STAMP to a persistent private timestamp file. Run `backup.sh` nightly and alert on its exit status. Define immutable offsite retention and test access using a separate recovery principal.

Each week, restore a restic snapshot into a private temporary directory, compare the recovered config, and run `restore-drill.sh /path/to/clinks.dump` against an isolated cluster containing the required roles. It restores a fresh database, checks the publication, privilege boundaries, auth and RLS and drops that drill database. `pitr-drill.sh` separately exercises a base backup, WAL archiving and recovery to a named point using a disposable container. Repeat with the provider archive and record recovery time and accepted data loss before opening the pilot.

Schedule `monitor.sh` on the private network with API_HEALTH_URL, SYNC_HEALTH_URL, PGDATABASE, BACKUP_STAMP and a login able to read the monitored slot and audit data. Set COMPOSE_FILE and the deployment environment to include webhook failure logs. The script returns failure for unhealthy endpoints, stale backups, failed sign-in spikes, stalled replication or logged webhook failures. Connect its exit status to a staffed alert destination and test delivery. The public sync proxy blocks administrative and probe endpoints.

Before processing patient records, approve the device working window, clinical data classification and retention periods, complete processor agreements and external security review, and test production recovery, revocation and the pilot with real users.
