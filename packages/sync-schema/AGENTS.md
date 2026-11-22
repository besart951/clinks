# packages/sync-schema — synced tables

`src/tables.ts` is the single source of the tables clients sync. `src/powersync-schema.generated.ts` is generated —
never edit it by hand.

Adding a synced table takes all of these in one PR:

1. A migration in `packages/db/migrations` (columns, RLS, grants — see `packages/db/AGENTS.md`).
2. An entry in `src/tables.ts` (columns, `read`/`write` permissions, `audit` kind, `references` for foreign keys).
3. `pnpm --filter @clinks/sync-schema generate` (CI runs it with `--check`).
4. A stream in `infra/powersync/sync-config.yaml` filtered by the `tenant_id` claim, active membership and the
   read permission.
5. The domain schema for writes in the API's `SyncService` (`apps/api/src/services/sync.ts`).
6. Tests: mapping in `test/`, an integration test for writes and the cross-tenant refusal.
