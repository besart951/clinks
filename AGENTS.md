# AGENTS.md

CLinks: Swiss multi-tenant SaaS (contacts, calendar, tasks, mail, finance with QR bills, Physio, Spitex) built as a
local-first static SvelteKit SPA, a Hono API and PostgreSQL with row-level security, synced through PowerSync.
This file is for every coding agent (Codex, Claude, Cursor, Copilot, Gemini, …). The nearest `AGENTS.md` to the file
you edit adds rules for that folder; read it too.

## Commands

Node 26, pnpm 12.21 (corepack), Docker. Run from the repo root.

```sh
pnpm install
pnpm dev:services        # Postgres 18, PowerSync, RustFS (S3), Mailpit
pnpm db:migrate          # apply packages/db/migrations
pnpm dev:api             # API on :8787
pnpm dev                 # web on :5176, mock backend; prefix VITE_API_URL=http://localhost:8787 for the real API
pnpm verify              # format, lint, translations, OpenAPI, types, unit tests, build — must pass before every PR
pnpm test:integration    # API + DB against real Postgres (needs dev:services)
pnpm test:e2e            # Playwright on the mock
pnpm --filter @clinks/web test:e2e:remote   # Playwright against the API (needs dev:services + dev:api)
pnpm format              # Prettier write
pnpm ops:check -- --config-dir /etc/clinks   # go-live preflight of the private env files and services (German output)
```

## Map

| Path                   | What                                                                 | Rules                                                            |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/web`             | SvelteKit 3 static SPA (Svelte 5, Tailwind 4), mock API, sync client | [apps/web/AGENTS.md](apps/web/AGENTS.md)                         |
| `apps/api`             | Hono API: auth, tenants, `/sync/write`, OpenAPI                      | [apps/api/AGENTS.md](apps/api/AGENTS.md)                         |
| `packages/db`          | Kysely, SQL migrations, RLS, `inScope`                               | [packages/db/AGENTS.md](packages/db/AGENTS.md)                   |
| `packages/sync-schema` | The synced tables; generates the PowerSync client schema             | [packages/sync-schema/AGENTS.md](packages/sync-schema/AGENTS.md) |
| `packages/domain`      | Pure rules and types, imports nothing                                | [packages/domain/AGENTS.md](packages/domain/AGENTS.md)           |
| `packages/contracts`   | Zod schemas, repository interfaces, generated `openapi.json`         | –                                                                |
| `packages/ui`          | shadcn-svelte components + CLinks kit                                | see `apps/web/AGENTS.md`                                         |
| `localization`         | `product-catalog.json`: every UI text, de-CH and en-US               | –                                                                |
| `infra`                | Compose dev stack, PowerSync config, Postgres init                   | –                                                                |
| `docs`                 | Plan, product docs, design systems, prototypes                       | [docs/README.md](docs/README.md)                                 |

`apps/*` may import `packages/*`, never each other.

## Non-negotiable rules

- Every UI text and every API error is a key in `localization/product-catalog.json` (de-CH and en-US, Swiss
  spelling without ß). Run `pnpm generate:translations` after changing it.
- Screens never touch storage or `fetch` directly; they go through the repositories in `apps/web/src/lib/data` and
  the platform interfaces in `apps/web/src/lib/platform`.
- Business rules (permissions, validation, numbering, audit) run in the API; clients display and queue.
- Persistent entity IDs are UUIDv7.
- The API touches tenant data only inside `inScope(db, { tenantId, userId }, …)` and connects as `clinks_api`,
  never as the owner. Secrets live in the `auth` schema, which PowerSync never sees.
- Schema changes are new files in `packages/db/migrations`; applied migrations are never edited.
- Pin dependencies to exact versions. Keep pnpm's `minimumReleaseAge` on.
- No secrets in the repo; only `.env` files (git-ignored), with `.env.example` documenting keys.

## Workflow

1. One branch and one PR per phase item or task; branch from `main`.
2. Implement with tests (unit in `test/`, integration for API/DB, e2e for user paths).
3. Run `pnpm verify` plus the suites your change touches; fix formatting with `pnpm format`.
4. Self-review the diff for smells (dead code, long methods, duplicated branches, primitive IDs where a domain type
   fits) without gold-plating.
5. Tick the item in `docs/plan.md` and in [Phases](#phases) below in the same PR.
6. Merge only when CI (`verify`, `integration`, `e2e`, `e2e-remote`) is green.

Workflow files under `.github/workflows` are maintained by hand (agents in sandboxes may be unable to push them).

## Skills

Agent skills live in `.agents/skills` (locked in `skills-lock.json`). `modern-web-guidance` is mandatory for every
HTML, CSS and client-side JS change: search its guides before writing UI code, follow their fallbacks for features
that are not Baseline widely available, and name the applied guides in the PR. Skip it for backend, infra, tooling
and test-only work. Update with `pnpx modern-web-guidance@latest update`. If your tool cannot load skills, read
`.agents/skills/modern-web-guidance/SKILL.md` directly.

## Phases

Details, gates and sub-items: [docs/plan.md](docs/plan.md). Product scope: [docs/product/backlog.md](docs/product/backlog.md).

- [x] **0 · Foundation** — monorepo, tooling, Compose dev stack, CI
  - [ ] Infomaniak: Public Cloud project; confirm logical replication on managed Postgres (owner: Besi)
- [x] **1 · Migrate prototype** — SvelteKit 3, packages split, repository + platform interfaces
- [x] **2 · Own login and tenants** — argon2id, TOTP, EdDSA JWT + JWKS, invitations, RLS tests
- [x] **3 · Sync core** — contacts + appointments on PowerSync, `/sync/write`, sync status
- [x] **4 · All modules on sync** — server-issued invoice numbers, append-only clinical notes and all eight workspace modules. The standalone demo keeps its seed and isolated mock.
- [x] **5 · Files and collaboration** — versioned objects, offline uploads, restore, planning-board presence and shared notes.
- [ ] **6 · Production, billing, pilot** — deployment, backups, restore drills, monitoring probes and Stripe integration implemented. Internal security review done ([docs/security-review.md](docs/security-review.md)). Provider setup ([docs/ops/livegang.md](docs/ops/livegang.md)), commercial configuration, alert delivery, external penetration test and real pilot remain open.
- [x] **7 · Native clients** — Tauri desktop shell and Flutter contact directory. Native signing, iOS validation and distribution remain release steps.
