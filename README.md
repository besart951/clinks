# clinks

clinks is a backend-free, clickable prototype of the complete CLinks SaaS: platform shell, contacts, calendar, tasks,
mail and campaigns, documents, finance with Swiss QR bills, Physio and Spitex — all running on a mock API in the
browser. Details: [`apps/web`](apps/web/README.md).

```
apps/web        SvelteKit app (Svelte 5, Tailwind 4), mock API, tests
packages/ui           shadcn-svelte components and the CLinks UI kit
packages/domain       pure business rules and types (money, QR bill, scheduling, permissions)
packages/contracts    shared Zod schemas and repository interfaces
packages/i18n-types   generated translation keys
localization          product-catalog.json – every UI text in de-CH and en-US
scripts               translation catalog generator
```

## Development

You need Node.js 26 LTS, pnpm 12 and Docker.

```sh
pnpm install
pnpm dev:services   # Postgres 18, PowerSync, S3 (RustFS), Mailpit – see infra/compose.dev.yml
pnpm dev            # http://localhost:5176
```

Demo sign-in: `besi@stille.ch` / `demo1234` (more accounts on the sign-in page). Until phase 3 the app still runs on its
in-browser mock API; the services are there for the API and sync work that follows.

| Service     | URL                                                                             |
| ----------- | ------------------------------------------------------------------------------- |
| PostgreSQL  | `postgresql://clinks:clinks-dev@localhost:5432/clinks` (logical replication on) |
| PowerSync   | http://localhost:8080 (probe: `/probes/liveness`)                               |
| S3 (RustFS) | http://localhost:9000, console http://localhost:9001                            |
| Mailpit     | http://localhost:8025                                                           |

Defaults work without configuration; override them in `infra/.env` (see `infra/.env.example`). Stripe webhooks:
`docker compose -f infra/compose.dev.yml --profile payments up -d` with a test-mode key.

pnpm 12 refuses packages published less than a day ago (`minimumReleaseAge`); keep that protection on.

## Checks

```sh
pnpm verify         # format, lint, translations, type checks, unit tests (Vitest), build
pnpm test:e2e       # Playwright (uses the installed Chrome)
```

After changing `localization/product-catalog.json` run `pnpm generate:translations`.

## Single-file build

`pnpm build:artifact` writes `apps/web/build-artifact/index.html`: the whole app, fonts included, in one HTML
file that runs from anywhere.
