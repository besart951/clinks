# AGENTS.md — Repository Instructions for AI & Autonomous Agents

Before changing this repository, read [codestyle.md](codestyle.md) and [apps/web/README.md](apps/web/README.md).

## Non-negotiable rules

- Every UI text is a key in `localization/product-catalog.json` (de-CH and en-US, Swiss spelling without ß). Run
  `pnpm generate:translations` after changing it.
- Screens never touch storage directly; they go through the repositories in `apps/web/src/lib/data`.
- Tenant-scoped data is always read and written through the tenant-scoped repository.
- Generate persistent entity IDs as UUIDv7.
- Errors come back localized from the API (and the mock API); screens render them verbatim. API errors are
  `ApiError` with a catalog key, never a hand-written message.
- The API reads and writes tenant data only inside `inScope(db, { tenantId, userId }, …)`, so row-level security
  applies; it connects as `clinks_api`, never as the database owner. Secrets (password hashes, TOTP secrets, token
  hashes) live in the `auth` schema, which is never published to PowerSync.
- Schema changes are new files in `packages/db/migrations`; applied migrations are never edited.
- Keep secrets out of the repository.

## Quality gate

Before handoff, run `pnpm verify`, for API or database changes `pnpm test:integration`, and for UI changes
`pnpm test:e2e`. Check for dead code, long methods,
duplicated branches and primitive IDs where a domain type is appropriate.

## Modern web guidance

The `modern-web-guidance` skill (GoogleChrome, installed under `.agents/skills/`, locked in `skills-lock.json`) is mandatory for every HTML, CSS and client-side JS change: search and retrieve the matching guides before writing UI code, follow their fallbacks for features that are not Baseline widely available, and name the applied guides in the PR. Skip it for backend, infra, tooling and test-only changes. Update it with `pnpx modern-web-guidance@latest update`.
