# CLinks – Build plan

Source of truth for the phases. Agents tick a box in the same PR that finishes the item and keep the short phase
checklist in [`AGENTS.md`](../AGENTS.md#phases) in step. Original planning doc (22.11.2026, not maintained):
[CLinks – Startplan](https://claude.ai/artifact/KW3EbQXgVVeDmgv4ghtyeH).

## Goal and guardrails

Build CLinks as a local-first web app (installable PWA) on one small server in Switzerland, in eight phases from an empty repo to a first paying pilot tenant. Desktop (Tauri) and mobile (Flutter) come later and must not require server changes.

**Guardrails from day one**

- Static single-page app only: no server-side rendering, no SvelteKit server routes. All server logic lives in the API.
- Business rules (permissions, validation, numbering, audit) run only in the write API. Clients display and queue.
- Browser access only through platform interfaces (`FileStore`, `SecureStorage`, `Notifier`, `Updater`), so Tauri and Flutter can plug in later.
- Own small login in the API: short-lived JWT access tokens (EdDSA) as bearer tokens plus rotating refresh tokens, no cookie sessions. API, PowerSync and Hocuspocus verify the same token via the API's JWKS endpoint.
- Allowed origins, keys and URLs come from config, never from code. Secrets only in `.env`.
- Every UI text in the translation catalog (de-CH, en-US); every package pinned to an exact version.
- Health data stays in Switzerland: servers, database, object storage and backups at Infomaniak. Payments for CLinks subscriptions run through Stripe, which never sees health data.

**Starting point:** the existing prototype in `besart951/clinks` (screens, domain logic, mock API, Zod schemas, tests). It becomes the product; only the mock data layer is replaced.

## Checked versions

All versions below were read from the npm registry on 22.11.2026; pin them exactly in `package.json` and let Renovate propose updates. Two deliberate holdbacks: TypeScript stays on 6.x because SvelteKit 3 and svelte-check declare TypeScript ^6, and PostgreSQL starts on 18 until PowerSync confirms 19 (released three days ago).

| Layer               | Package / service                         | Version                                | Note                                                                                                      |
| ------------------- | ----------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Runtime             | Node.js                                   | 26 LTS                                 | Active LTS since 28.10.2026, supported until April 2029 ([endoflife.date](https://endoflife.date/nodejs)) |
| Tooling             | pnpm                                      | 12.21.0                                | Pin via `packageManager` + corepack                                                                       |
| Tooling             | TypeScript                                | 6.0.3                                  | 7.0.2 is out, but SvelteKit 3 peers on ^6                                                                 |
| UI                  | svelte                                    | 5.59.1                                 | Svelte 5 is still the current major                                                                       |
| UI                  | @sveltejs/kit                             | 3.4.0                                  | New major; prototype is on 2.70 → migrate in phase 1                                                      |
| UI                  | @sveltejs/adapter-static                  | 4.0.1                                  | SPA build for web, PWA and Tauri                                                                          |
| UI                  | @sveltejs/vite-plugin-svelte              | 7.3.1                                  |                                                                                                           |
| Build               | vite                                      | 8.3.8                                  |                                                                                                           |
| UI                  | tailwindcss + @tailwindcss/vite           | 4.3.5                                  |                                                                                                           |
| UI                  | bits-ui / shadcn-svelte                   | 2.22.0 / 1.8.1                         |                                                                                                           |
| UI                  | @lucide/svelte                            | 1.77.0                                 |                                                                                                           |
| Sync client         | @powersync/web                            | 2.7.0                                  | Ships @journeyapps/wa-sqlite 2.0.10 (SQLite in WASM, OPFS)                                                |
| Sync client         | @powersync/common                         | 2.5.0                                  | Shared schema and types                                                                                   |
| Sync client (later) | @powersync/tauri-plugin                   | 0.0.6                                  | Alpha, only for phase 7                                                                                   |
| Collaboration       | yjs / y-protocols                         | 13.6.33 / 1.0.7                        |                                                                                                           |
| Collaboration       | y-indexeddb                               | 9.0.12                                 | Offline copy of open Yjs docs                                                                             |
| Collaboration       | @hocuspocus/server / provider             | 4.9.0                                  | Plus @hocuspocus/extension-database 4.9.0                                                                 |
| Rich text           | @tiptap/core                              | 3.35.0                                 | Only where text is edited together                                                                        |
| API                 | hono / @hono/node-server                  | 4.13.20 / 2.1.11                       |                                                                                                           |
| API                 | @hono/zod-openapi                         | 1.6.3                                  | OpenAPI from Zod for Dart later                                                                           |
| Validation          | zod                                       | 4.6.7                                  | Shared client and server                                                                                  |
| Auth                | jose                                      | 6.2.18                                 | Sign and verify JWTs (EdDSA), JWKS                                                                        |
| Auth                | @node-rs/argon2                           | 2.2.2                                  | Password hashing (argon2id)                                                                               |
| Auth                | @oslojs/otp + @oslojs/encoding            | 1.1.0 + 1.1.0                          | TOTP for 2FA                                                                                              |
| Auth (later)        | @simplewebauthn/server / browser          | 14.1.0 / 14.0.0                        | Passkeys after the pilot                                                                                  |
| Mail                | nodemailer                                | 10.6.1                                 | Invitations, verification, reset                                                                          |
| Payments            | stripe (server) / @stripe/stripe-js       | 23.2.0 / 10.3.0                        | Checkout, subscriptions, customer portal, webhooks                                                        |
| Database access     | kysely + pg                               | 0.29.9 + 8.23.1                        | Typed SQL, no heavy ORM                                                                                   |
| Files               | @aws-sdk/client-s3 + s3-request-presigner | 3.1175.0                               | Against Infomaniak Object Storage                                                                         |
| Database            | PostgreSQL                                | 18 (19 later)                          | `wal_level=logical` for PowerSync                                                                         |
| Sync server         | PowerSync Open Edition                    | latest `journeyapps/powersync-service` | Pin the image digest at setup                                                                             |
| Tests               | vitest / @playwright/test                 | 5.1.1 / 1.65.1                         |                                                                                                           |
| Quality             | svelte-check / prettier / eslint          | 4.7.8 / 3.10.1 / 10.15.0               | prettier-plugin-svelte 4.2.0                                                                              |
| Desktop (later)     | @tauri-apps/cli / api                     | 2.12.6 / 2.12.5                        | Phase 7                                                                                                   |

## Repo structure

One pnpm monorepo, evolved from the existing `besart951/clinks`; the prototype app becomes `apps/web`.

| Folder                 | Holds                                                                                                            | Depends on                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `apps/web`             | SvelteKit static app: screens, view models, repositories, platform interfaces (web implementation)               | domain, contracts, sync-schema, ui |
| `apps/api`             | Hono server: login, 2FA, tokens and JWKS, write endpoint, signed URLs, Stripe checkout and webhooks, mail, admin | domain, contracts, db              |
| `apps/collab`          | Hocuspocus server: rooms, JWT check, snapshot persistence                                                        | contracts, db                      |
| `packages/domain`      | Pure rules and types: money/VAT, QR bill, scheduling, permissions, plans                                         | –                                  |
| `packages/contracts`   | Zod schemas for every write, API DTOs, generated OpenAPI file                                                    | domain                             |
| `packages/sync-schema` | One source for the client schema; generates PowerSync TS schema now, Dart later                                  | –                                  |
| `packages/db`          | Kysely types, SQL migrations, seed data, tenant-scoped transaction helper                                        | –                                  |
| `packages/ui`          | shadcn-svelte components + the kit (inline fields, accordion, side cards)                                        | –                                  |
| `localization`         | `product-catalog.json` + generator for TS keys                                                                   | –                                  |
| `infra`                | Docker Compose (dev + prod), PowerSync `service.yaml` and sync streams, Caddy, backup scripts to Swiss Backup    | –                                  |

Rule: `apps/*` may import `packages/*`, never each other; `packages/domain` imports nothing.

## Phase plan

A phase ends only when its gate passes; the weeks are my estimate for one full-time developer and will move.

### Phase 0 · Foundation

- [x] Enable corepack, set `packageManager: pnpm@12.21.0`, `engines.node: >=26`
- [x] Create folders per repo structure, root `tsconfig` (TypeScript 6.0.3), Prettier, ESLint, Vitest, Playwright
- [x] Docker Compose dev: PostgreSQL 18 (`wal_level=logical`), PowerSync service, RustFS as local S3 (MinIO image is gone), Mailpit, Stripe CLI for webhooks
- [x] CI (`pnpm verify`: format, types, translations, tests, build); fix the workflow file left over from the cleanup
- [ ] Infomaniak: open a Public Cloud project; ask whether the managed Database Service allows logical replication for PowerSync (otherwise run Postgres on an instance)

### Phase 1 · Migrate prototype

- [x] Upgrade to SvelteKit 3.4, Vite 8.3, vite-plugin-svelte 7.3, Svelte 5.59, Tailwind 4.3.5
- [x] Move domain, schemas, UI kit and catalog into `packages/*`
- [x] Define repository interfaces in `packages/contracts`; mock database implements them
- [x] Platform interfaces (`FileStore`, `SecureStorage`, `Notifier`, `Updater`) with web implementation

### Phase 2 · Own login and tenants

- [x] Hono API skeleton, config from env, health endpoint, OpenAPI via @hono/zod-openapi
- [x] Migrations: users, tenants, memberships, roles, invitations, refresh tokens, audit (the prototype's account model)
- [x] Login: email + password hashed with argon2id (@node-rs/argon2), rate limit and lockout per account and IP
- [x] 2FA with TOTP (@oslojs/otp) and recovery codes; passkeys (@simplewebauthn) later, not for the pilot
- [x] Tokens: jose signs EdDSA access tokens (15 min) with `sub`, `tenant_id`, `role`; refresh tokens (30 days) stored hashed, rotated on use, revocable per device; `/.well-known/jwks.json` for PowerSync and Hocuspocus
- [x] Invitations, email verification and password reset via mail (nodemailer, Mailpit locally); tenant switch issues a new access token
- [x] SPA: login screens from the prototype, access token in memory, refresh token as HttpOnly cookie on `/auth`, behind `SecureStorage`
- [x] Tests: cross-tenant read and write are refused; expired, tampered and revoked tokens are rejected

### Phase 3 · Sync core

- [x] Postgres schema for contacts and appointments, row-level security, revision columns
- [x] Sync streams per tenant and role in PowerSync (`infra/powersync/sync-config.yaml`, streams edition 3)
- [x] Write endpoint: batched ops → Zod → permission → transaction → audit
- [x] `packages/sync-schema` generates the PowerSync client schema; @powersync/web replaces the mock for contacts and calendar
- [x] Sync status in the shell (offline, pending writes, last sync)

### Phase 4 · All modules on sync

- [x] Tasks, comments, notifications, mail metadata, campaigns
- [x] Finance: invoices, payments, expenses; invoice numbers assigned by the server
- [x] Physio and Spitex: prescriptions, notes (append-only), visits, time entries
- [x] Connected mode uses the API and SQLite repositories. The standalone demo keeps its isolated mock and seed.

### Phase 5 · Files and collaboration

- [x] Bucket with versioning and object lock; signed URL endpoints
- [x] Offline attachment upload through the durable PowerSync CRUD queue; `documents` + `document_versions`; restore = new version
- [x] `apps/collab` with Hocuspocus 4.9 + database extension; JWT check on connect
- [x] Live presence on planning boards; Yjs + Tiptap for shared texts
- [x] Per-tenant storage (CLinks, Infomaniak, Cloudflare R2, other S3): `/tenant/storage` endpoints, secret sealed with jose JWE (`STORAGE_SECRET_KEY`) in `auth.storage_configs`, connection test that names what a bucket lacks, SSRF guard on endpoints, `document_versions.storage_id` keeps old versions readable after a switch (PR #17)

### Phase 6 · Production, billing and pilot

- [ ] Infomaniak Public Cloud: instance(s) in a private network, Caddy with TLS, Compose production file, secrets outside the repo
- [ ] PostgreSQL: managed Database Service (automatic backups, point-in-time recovery) if logical replication works, else Postgres on its own instance with WAL archiving
- [ ] Infomaniak Object Storage: bucket with versioning, object lock and lifecycle rules for old versions
- [ ] Swiss Backup as second copy (database dumps, config); restore test documented
- [ ] Stripe: products and prices in CHF per plan and module, Stripe Checkout + Customer Portal, TWINT and cards, Stripe Tax for Swiss VAT
- [x] Stripe webhooks (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`) update plan and modules of the tenant; idempotent, signature checked
- [x] Internal security review against the table below ([security-review.md](security-review.md)): CSP, security headers, SSRF and DNS-rebinding guard, RLS regression test
- [ ] Monitoring alerts delivered to a person; external penetration test before the pilot
- [ ] Pilot tenant onboarded with real users

### Phase 7 · Later

- [x] Tauri 2.12 shell around the same build (PowerSync Tauri plugin once out of alpha)
- [x] Flutter app with the PowerSync Dart SDK, models generated from the OpenAPI file

The production templates and operator procedures are in [infra/production](../infra/production/README.md). The Swiss provider project, managed replication approval, offsite restore, live payment setup, external security review and real pilot remain open. Local acceptance used versioned RustFS, two independent browsers, encrypted restic backup/restore and PostgreSQL WAL replay. Billing tests use a signed event and test transport. Plan entitlements are bundled. Independently priced add-ons need commercial rates.

The [Tauri shell](../apps/desktop/README.md) uses the web workspace. The [Flutter client](../apps/mobile/README.md) implements the account, tenant and contact flows. Native store signing and iOS acceptance remain open.

## Security and operations

The security model rests on one rule: only values signed into the JWT decide what a client may read, and only the API may write.

| Area                  | Decision                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                 | Own login in the API: argon2id password hashes, TOTP 2FA with recovery codes, rate limit and lockout, reset links valid 1 hour, invitations 72 hours, both single use                                                            |
| Tokens                | EdDSA access JWT 15 min with `sub`, `tenant_id`, `role`; refresh token 30 days, stored hashed, rotated on use, reuse revokes the whole device; signing key in `.env`, rotated every 90 days via JWKS (old key kept until expiry) |
| Tenant isolation      | Sync streams filter only by JWT claims (tenant, role); API writes run in a transaction that sets the tenant; Postgres row-level security as second wall                                                                          |
| Writes                | Zod validation + permission check + audit entry in the same transaction; conflicts by revision, last write wins per field                                                                                                        |
| Files                 | Private bucket on Infomaniak Object Storage, keys `tenant/document/version`, signed URLs ≤ 5 min, size/type limits; versioning and object lock are supported ([feature matrix](https://docs.infomaniak.cloud/s3aas/features))    |
| Payments              | Stripe Checkout and Customer Portal (card data never touches CLinks); webhook signatures checked, handlers idempotent; only plan and billing data go to Stripe                                                                   |
| Live rooms            | Hocuspocus checks JWT and room tenant on connect; room names carry no rights                                                                                                                                                     |
| Device data           | Sync only a working window per user; wipe local DB and caches on sign-out; idle sign-out                                                                                                                                         |
| Transport and storage | TLS everywhere (Caddy, automatic certificates); Infomaniak storage runs on an encrypted Ceph cluster (LUKS) with object encryption ([Public Cloud](https://www.infomaniak.com/en/hosting/public-cloud))                          |
| Backups               | Database with point-in-time recovery; second copy to Swiss Backup, which keeps three copies in two data centres ([Swiss Backup](https://www.infomaniak.com/en/swiss-backup/cloud-storage)); weekly restore test                  |
| Monitoring            | Health endpoints, structured JSON logs, uptime check, error tracking self-hosted; alerts on failed logins, replication lag, failed webhooks and failed backups                                                                   |
| Compliance            | Data processing agreements with Infomaniak and Stripe, record of processing activities (revDSG), retention rules per document type                                                                                               |

## As built (deviations from the original plan)

- Tokens carry `sub`, `tenant_id`, `role` and `sid` (session id). Outside production the API creates an ephemeral
  signing key with a unique key id per start; production needs a stable key from `pnpm --filter @clinks/api keys`.
- The API connects as `clinks_api` (member of `clinks_app`) and runs every tenant read and write in
  `inScope(db, { tenantId, userId }, …)`, which sets the scope for row-level security. Secrets live in the `auth`
  schema and are never published to PowerSync.
- Sync: `POST /sync/write` applies one client transaction atomically; streams filter by the `tenant_id` claim plus
  active membership and read permission. `@powersync/web` is loaded only when `VITE_API_URL` is set; without it the
  app runs fully on the in-browser mock.
- CI on GitHub runs three jobs: `verify`, integration tests against a Postgres service, and Playwright e2e on the mock.
- Production must set `TRUST_PROXY=true` behind Caddy so rate limits see the client IP.

## Risks and open decisions

| Risk or decision                                                                                                          | Impact                                | Plan                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SvelteKit 3 is a new major; prototype is on 2.70                                                                          | Migration work in phase 1             | Migrate first, before new code; stay on 2.70 if a blocker appears                                                                    |
| Infomaniak's managed PostgreSQL may not allow logical replication                                                         | PowerSync cannot connect              | Ask in phase 0; fallback is Postgres on its own Infomaniak instance with WAL archiving                                               |
| Own login means we own its security                                                                                       | Mistakes in auth are costly           | Use proven libraries only (argon2, jose, oslo), no own crypto; auth tests for every rule; external penetration test before the pilot |
| Customers later ask for SSO (Microsoft, Google)                                                                           | Extra work                            | Keep tokens standard (JWT + JWKS) so an OIDC login can be added to the same API later                                                |
| Infomaniak Object Storage supports SSE-C but not SSE-KMS ([feature matrix](https://docs.infomaniak.cloud/s3aas/features)) | No managed per-object keys            | Rely on the encrypted cluster; add SSE-C with our own keys for the most sensitive documents if required                              |
| PowerSync Open Edition is FSL-licensed, self-hosting docs marked beta                                                     | License terms, less documentation     | Read the license once; pin the image; keep sync logic behind the repository layer                                                    |
| PostgreSQL 19 support in PowerSync not yet confirmed                                                                      | Upgrade later                         | Start on 18, upgrade after PowerSync lists 19                                                                                        |
| Stripe: TWINT has a CHF 5,000 limit and onboarding rules ([TWINT docs](https://docs.stripe.com/payments/twint))           | Large annual plans may fail via TWINT | Use eligible payment methods for the merchant and subscription. Stripe excludes B2B payments from TWINT.                             |
| Offline conflicts on the same record                                                                                      | Lost edits                            | Revisions per row, last write wins per field, care notes append-only                                                                 |
| Browser storage can be evicted (Safari)                                                                                   | Unsynced writes lost                  | Request persistent storage, show unsynced count, warn before sign-out                                                                |
| Health data on staff devices                                                                                              | Data protection                       | Working window only, wipe on sign-out, server-only data class for sensitive notes                                                    |
