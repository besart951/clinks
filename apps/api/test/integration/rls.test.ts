import assert from 'node:assert/strict';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { startApi, type Api } from './harness.ts';

/**
 * Global identity tables that the API reads before any tenant is known (sign-in, refresh, password reset).
 * They hold no tenant data, are never synced directly (users only through memberships of the same tenant)
 * and are reached only through the API's own queries.
 */
const withoutTenant = [
	// Reminders due across workspaces: ids only, like the mail queue.
	'auth.appointment_reminders',
	// Campaigns due to go out across workspaces: ids only, like the mail queue.
	'auth.campaign_queue',
	'auth.credentials',
	// The worker's queue across workspaces: ids only, the mail itself is read in the workspace's scope.
	'auth.mail_queue',
	// Workspaces with outbox mail, for the daily retention run: ids only.
	'auth.mail_retention',
	// Filing addresses by their random local part: read before the workspace is known.
	'auth.mail_inbound_addresses',
	'auth.one_time_tokens',
	'auth.recovery_codes',
	'auth.refresh_tokens',
	'public.system_status',
	'public.users',
];

/** A new table without row-level security would let one tenant read another's rows through the app role. */
describe('row-level security', () => {
	let api: Api;
	beforeAll(async () => {
		api = await startApi();
	});
	afterAll(async () => {
		await api?.stop();
	});

	it('is enabled and forced on every table of the application', async () => {
		const { rows } = await sql<{ name: string }>`
			SELECT n.nspname || '.' || c.relname AS name
			FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE c.relkind = 'r' AND n.nspname IN ('public', 'auth') AND c.relname <> 'schema_migrations'
				AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
			ORDER BY 1`.execute(api.owner);
		assert.deepEqual(
			rows.map((row) => row.name).filter((name) => !withoutTenant.includes(name)),
			[],
		);
	});

	it('keeps the migration ledger away from the app role', async () => {
		const { rows } = await sql<{ privilege: string }>`
			SELECT privilege_type AS privilege FROM information_schema.role_table_grants
			WHERE table_name = 'schema_migrations' AND grantee = 'clinks_app'`.execute(api.owner);
		assert.deepEqual(rows, []);
	});

	it('grants only append privileges (SELECT, INSERT) on audit to the app role', async () => {
		const { rows } = await sql<{ privilege: string }>`
			SELECT privilege_type AS privilege FROM information_schema.role_table_grants
			WHERE table_schema = 'public' AND table_name = 'audit' AND grantee = 'clinks_app'
			ORDER BY 1`.execute(api.owner);
		assert.deepEqual(
			rows.map((row) => row.privilege),
			['INSERT', 'SELECT'],
		);
	});

	it('keeps clinks_sync read-only on public tables and completely out of auth and schema_migrations', async () => {
		const { rows: nonSelectPublic } = await sql<{ table_name: string; privilege_type: string }>`
			SELECT table_name, privilege_type FROM information_schema.role_table_grants
			WHERE grantee = 'clinks_sync' AND table_schema = 'public' AND privilege_type <> 'SELECT'`.execute(api.owner);
		assert.deepEqual(nonSelectPublic, []);

		const { rows: sensitive } = await sql<{ table_schema: string; table_name: string }>`
			SELECT table_schema, table_name FROM information_schema.role_table_grants
			WHERE grantee = 'clinks_sync' AND (table_schema = 'auth' OR table_name = 'schema_migrations')`.execute(api.owner);
		assert.deepEqual(sensitive, []);
	});
});
