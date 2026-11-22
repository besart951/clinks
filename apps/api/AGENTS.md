# apps/api — Hono API

Hono 4 on Node with `@hono/zod-openapi`. Owns sign-in, tenants, invitations, tokens and every write.

- Routes are thin: validate with Zod from `@clinks/contracts`, call a service in `src/services`, return the DTO.
  Business rules (permissions, validation, numbering, audit) live in services, not in routes or clients.
- Tenant data only inside `inScope(db, { tenantId, userId }, tx => …)` from `@clinks/db`; write an audit entry in
  the same transaction (`services/audit.ts`). The connection role is `clinks_api`; never use the owner URL here.
- Failures are `new ApiError(status, 'error.…', fields?)` (`src/errors.ts`) with a catalog key; the error handler
  localizes it. Never return hand-written messages. Unknown errors become `error.internal`.
- Tokens: EdDSA access JWT (15 min) with `sub`, `tenant_id`, `role`, `sid`; refresh token as HttpOnly cookie on
  `/auth`, stored hashed, rotated on use. Keys come from env (`pnpm --filter @clinks/api keys`); outside production
  an ephemeral key with a unique key id is created per start. Secrets only in `apps/api/.env`.
- Crypto only through `jose`, `@node-rs/argon2`, `@oslojs/otp`; no hand-rolled crypto.
- Sync writes (`POST /sync/write`, `services/sync.ts`): one client transaction applied atomically; the domain schema
  per table lives in `SyncService`. Cross-tenant references are refused; a unique violation on another tenant's id
  returns 409.
- After changing a route or contract run `pnpm --filter @clinks/api openapi` (CI checks
  `packages/contracts/openapi.json`).

## Tests

- `test/unit` (Vitest, no DB) and `test/integration` (real Postgres, one fresh DB per file via `harness.ts`).
- Every auth or tenant rule gets an integration test, including the refusal: cross-tenant read/write, expired,
  tampered and revoked tokens. Run `pnpm test:integration` (needs `pnpm dev:services`).
