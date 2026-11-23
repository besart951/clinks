# clinks

clinks is the CLinks SaaS: platform shell, contacts, calendar, tasks, mail and campaigns, documents, finance with
Swiss QR bills, Physio and Spitex. Sign-in, accounts and tenants run on the real API; all eight workspace modules sync
through PowerSync. They read and write local SQLite and upload queued changes when the connection returns. Details: [`apps/web`](apps/web/README.md).

Working with an AI agent? Start at [`AGENTS.md`](AGENTS.md); plan, product docs and design systems are indexed in
[`docs/`](docs/README.md).

```
apps/web        SvelteKit app (Svelte 5, Tailwind 4), mock API, tests
apps/api        Hono API: own sign-in (argon2id, TOTP), EdDSA tokens + JWKS, tenants, invitations, OpenAPI
apps/collab      Hocuspocus service for shared planning notes and presence
apps/desktop     Tauri shell around the web workspace
apps/mobile      Flutter native client, API sessions and synced contacts
infra/production Compose, Caddy, OpenTofu, monitoring and restore drills
packages/db           Kysely types, SQL migrations, row-level security, tenant-scoped transactions
packages/sync-schema  the synced tables in one place: generates the PowerSync client schema, maps rows
packages/ui           shadcn-svelte components and the CLinks UI kit
packages/domain       pure business rules and types (money, QR bill, scheduling, permissions)
packages/contracts    shared Zod schemas and repository interfaces
packages/i18n-types   generated translation keys
localization          product-catalog.json – every UI text in de-CH and en-US
scripts               translation catalog generator
docs                  build plan, product docs, design systems, prototypes
```

## Development

You need Node.js 26 LTS, pnpm 12 and Docker.

```sh
pnpm install
pnpm dev:services   # Postgres 18, PowerSync, S3 (RustFS), Mailpit – see infra/compose.dev.yml
pnpm db:migrate     # applies packages/db/migrations as the database owner
pnpm dev:api        # http://localhost:8787 – OpenAPI at /openapi.json, keys at /.well-known/jwks.json
VITE_API_URL=http://localhost:8787 pnpm dev   # http://localhost:5176, signed in through the API
```

Without `VITE_API_URL` the app runs fully on the mock (demo sign-in `besi@stille.ch` / `demo1234`, code `000000`) –
that is also what the single-file build and `pnpm test:e2e` use. With it, sign-up codes, reset links and invitations
arrive in Mailpit, and workspace module data syncs through PowerSync (`VITE_POWERSYNC_URL`, default
http://localhost:8080): writes go to the local database first and up through `POST /sync/write`. On tenant selection, the browser imports its previous local-only module records through `POST /sync/import`. The import keeps existing server records and clears the imported local copies after the transaction succeeds. Outside production the API makes a signing key at start-up; for a stable one run
`pnpm --filter @clinks/api keys` and put the line into `apps/api/.env` (see `apps/api/.env.example`).

| Service     | URL                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------- |
| PostgreSQL  | `postgresql://clinks:clinks-dev@localhost:5432/clinks` (logical replication on)             |
| API role    | `postgresql://clinks_api:clinks-api-dev@localhost:5432/clinks` (row-level security applies) |
| PowerSync   | http://localhost:8080 (probe: `/probes/liveness`)                                           |
| S3 (RustFS) | http://localhost:9000, console http://localhost:9001                                        |
| Mailpit     | http://localhost:8025                                                                       |

Defaults work without configuration; override them in `infra/.env` (see `infra/.env.example`). Stripe webhooks:
`docker compose -f infra/compose.dev.yml --profile payments up -d` with a test-mode key.

pnpm 12 refuses packages published less than a day ago (`minimumReleaseAge`); keep that protection on.

## Checks

```sh
pnpm verify             # format, lint, translations, type checks, unit tests (Vitest), build
pnpm test:integration   # API and database against real Postgres (needs dev:services); one fresh DB per file
pnpm test:e2e           # Playwright on the mock (uses the installed Chrome)
pnpm --filter @clinks/web test:e2e:remote   # Playwright against the API (needs dev:services and dev:api)
```

After changing a route or a contract, run `pnpm --filter @clinks/api openapi` to refresh
`packages/contracts/openapi.json`. A new synced table means: a migration, an entry in
`packages/sync-schema/src/tables.ts` (then `pnpm --filter @clinks/sync-schema generate`), a stream in
`infra/powersync/sync-config.yaml` and a domain schema in the API's `SyncService`.

After changing `localization/product-catalog.json` run `pnpm generate:translations`.

## Connected services

See the [web workspace](apps/web/README.md) for local files and collaboration, the [production runbook](infra/production/README.md) for billing and recovery, and the [phase plan](docs/plan.md) for outstanding launch gates.

## Single-file build

`pnpm build:artifact` writes `apps/web/build-artifact/index.html`: the whole app, fonts included, in one HTML
file that runs from anywhere.
