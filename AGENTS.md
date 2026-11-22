# AGENTS.md — Repository Instructions for AI & Autonomous Agents

Before changing this repository, read [codestyle.md](codestyle.md) and [apps/workspace/README.md](apps/workspace/README.md).

## Non-negotiable rules

- Every UI text is a key in `localization/product-catalog.json` (de-CH and en-US, Swiss spelling without ß). Run
  `pnpm generate:translations` after changing it.
- Screens never touch storage directly; they go through the repositories in `apps/workspace/src/lib/data`.
- Tenant-scoped data is always read and written through the tenant-scoped repository.
- Generate persistent entity IDs as UUIDv7.
- Errors come back localized from the mock API; screens render them verbatim.
- Keep secrets out of the repository.

## Quality gate

Before handoff, run `pnpm verify:push` and, for UI changes, `pnpm test:e2e`. Check for dead code, long methods,
duplicated branches and primitive IDs where a domain type is appropriate.
