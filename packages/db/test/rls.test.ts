import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createDb, type Db } from '../src/client.ts';
import { inScope } from '../src/scope.ts';
import { createTestDatabase, type TestDatabase } from '../src/testing.ts';

let database: TestDatabase;
let owner: Db;
let app: Db;
const tenantA = randomUUID();
const tenantB = randomUUID();
const alice = randomUUID();
const bob = randomUUID();
const roleA = randomUUID();
const roleB = randomUUID();

beforeAll(async () => {
	database = await createTestDatabase();
	owner = createDb(database.ownerUrl, { max: 2 });
	app = createDb(database.appUrl, { max: 2 });
	await owner
		.insertInto('tenants')
		.values([
			{ id: tenantA, name: 'A', industry: 'physio' },
			{ id: tenantB, name: 'B', industry: 'spitex' },
		])
		.execute();
	await owner
		.insertInto('users')
		.values([
			{ id: alice, email: 'alice@example.ch', globalRole: null, emailVerifiedAt: null },
			{ id: bob, email: 'bob@example.ch', globalRole: null, emailVerifiedAt: null },
		])
		.execute();
	await owner
		.insertInto('roles')
		.values([
			{ id: roleA, tenantId: tenantA, name: 'Administrator', kind: 'administrator' },
			{ id: roleB, tenantId: tenantB, name: 'Administrator', kind: 'administrator' },
		])
		.execute();
	await owner
		.insertInto('memberships')
		.values([
			{ id: randomUUID(), tenantId: tenantA, userId: alice, roleId: roleA },
			{ id: randomUUID(), tenantId: tenantB, userId: bob, roleId: roleB },
		])
		.execute();
});

afterAll(async () => {
	await owner?.destroy();
	await app?.destroy();
	await database?.drop();
});

describe('row-level security', () => {
	it('shows a tenant only its own rows', async () => {
		const rows = await inScope(app, { tenantId: tenantA, userId: alice }, (tx) =>
			tx.selectFrom('memberships').select(['tenantId']).execute(),
		);
		assert.deepEqual(
			rows.map((row) => row.tenantId),
			[tenantA],
		);
	});

	it('shows nothing without a scope', async () => {
		const rows = await app.selectFrom('memberships').selectAll().execute();
		assert.equal(rows.length, 0);
	});

	it('lets a user see their own memberships and tenants across tenants, nothing else', async () => {
		const tenants = await inScope(app, { tenantId: null, userId: alice }, (tx) =>
			tx.selectFrom('tenants').select('id').execute(),
		);
		assert.deepEqual(
			tenants.map((row) => row.id),
			[tenantA],
		);
	});

	it('refuses writes into another tenant', async () => {
		await assert.rejects(
			inScope(app, { tenantId: tenantA, userId: alice }, (tx) =>
				tx.insertInto('roles').values({ id: randomUUID(), tenantId: tenantB, name: 'Evil', kind: 'custom' }).execute(),
			),
			/row-level security/,
		);
		const updated = await inScope(app, { tenantId: tenantA, userId: alice }, (tx) =>
			tx.updateTable('tenants').set({ name: 'Taken' }).where('id', '=', tenantB).executeTakeFirst(),
		);
		assert.equal(updated.numUpdatedRows, 0n);
	});

	it('keeps the scope inside its transaction', async () => {
		await inScope(app, { tenantId: tenantA, userId: alice }, async () => {});
		const rows = await app.selectFrom('roles').selectAll().execute();
		assert.equal(rows.length, 0);
	});

	it('reaches the auth schema through the camel-case plugin', async () => {
		const rows = await app.selectFrom('auth.refreshTokens').selectAll().execute();
		assert.equal(rows.length, 0);
	});
});

it('updates the stream lookup on role, module and membership changes within the same transaction', async () => {
	await inScope(app, { tenantId: tenantA, userId: alice }, async (tx) => {
		const read = async () =>
			(await tx.selectFrom('syncAccess').select('readPermissions').where('userId', '=', alice).executeTakeFirst())
				?.readPermissions;
		await tx
			.updateTable('roles')
			.set({ permissions: ['contacts.read', 'finance.read'] })
			.where('id', '=', roleA)
			.execute();
		await tx
			.updateTable('tenants')
			.set({ enabledModules: ['finance'] })
			.where('id', '=', tenantA)
			.execute();
		assert.deepEqual(await read(), ['contacts.read', 'finance.read']);
		await tx.updateTable('tenants').set({ enabledModules: [] }).where('id', '=', tenantA).execute();
		assert.deepEqual(await read(), ['contacts.read']);
		assert.equal((await tx.selectFrom('syncAccess').select('id').where('tenantId', '=', tenantB).execute()).length, 0);
		await tx.updateTable('memberships').set({ status: 'inactive' }).where('userId', '=', alice).execute();
		assert.equal(await read(), undefined);
	});
});
