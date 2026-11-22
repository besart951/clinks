# packages/db — schema, migrations, RLS

- Migrations are plain SQL in `migrations/NNNN_name.sql`, applied in order by `pnpm db:migrate` as the owner.
  Never edit an applied migration; add a new file. Keep `src/schema.ts` (Kysely types, camelCase via
  `CamelCasePlugin`) in step with the SQL.
- Every tenant table has `id uuid` (UUIDv7 from the app), `tenant_id`, `revision`, `created_at`, `updated_at`,
  row-level security enabled and forced, and policies on the scope set by `inScope` (`src/scope.ts`).
- Grant to `clinks_app` (the API role `clinks_api` is a member); never grant on the `auth` schema to PowerSync.
- Secrets (password hashes, TOTP secrets, token hashes) belong in the `auth` schema only.
- Synced tables must match `packages/sync-schema/src/tables.ts`; its test checks the migration.
- Test RLS in `test/rls.test.ts` (integration, real Postgres): a policy is not done until another tenant is refused.
