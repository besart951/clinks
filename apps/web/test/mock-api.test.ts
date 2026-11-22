import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'vitest';
import { AccountApi, roleFor } from '../src/lib/data/account-api.ts';
import { MockApiError, MockDatabase, type StorageLike } from '../src/lib/data/database.ts';
import { contactSchema } from '../src/lib/data/schemas.ts';
import { createSeed, demoPassword } from '../src/lib/data/seed.ts';
import { WorkspaceApi } from '../src/lib/data/workspace-api.ts';
import { roleGrants } from '../src/lib/domain/permissions.ts';
import type { TenantId, UserId } from '../src/lib/domain/ids.ts';

class MemoryStorage implements StorageLike {
	values = new Map<string, string>();
	limit = Number.POSITIVE_INFINITY;
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		if (value.length > this.limit) throw new Error('QuotaExceededError');
		this.values.set(key, value);
	}
	removeItem(key: string) {
		this.values.delete(key);
	}
}

const localize = (key: string) => `[${key}]`;

function setup(options: { failureRate?: number; offline?: boolean } = {}) {
	const storage = new MemoryStorage();
	const conditions = {
		minLatency: 0,
		maxLatency: 0,
		failureRate: options.failureRate ?? 0,
		offline: options.offline ?? false,
	};
	const db = new MockDatabase({
		storage,
		seed: () => createSeed(new Date('2026-11-21T10:00:00Z')),
		conditions: () => conditions,
		localize,
		sleep: async () => undefined,
		random: () => 0.5,
	});
	const caller = { userId: null as UserId | null, tenantId: null as TenantId | null };
	const context = {
		tenantId: () => caller.tenantId,
		actorId: () => caller.userId,
		can: (permission: Parameters<typeof roleGrants>[1]) =>
			roleGrants(roleFor(db, caller.userId, caller.tenantId), permission),
		localize,
	};
	const api = new WorkspaceApi(db, context);
	const account = new AccountApi(db, { userId: () => caller.userId, tenantId: () => caller.tenantId, localize });
	const as = (email: string, tenantName?: string) => {
		const user = db.table('users').find((row) => row.email === email)!;
		caller.userId = user.id;
		const memberships = db.table('memberships').filter((row) => row.userId === user.id);
		const tenant = db
			.table('tenants')
			.find((row) =>
				tenantName ? row.name === tenantName : memberships.some((membership) => membership.tenantId === row.id),
			);
		caller.tenantId = tenant?.id ?? null;
		return user;
	};
	return { db, api, account, as, storage, conditions };
}

describe('mock API', () => {
	let env: ReturnType<typeof setup>;
	beforeEach(() => {
		env = setup();
	});

	it('keeps tenants apart', async () => {
		env.as('besi@stille.ch', 'Stille Physio');
		const physio = await env.api.contacts.list();
		env.as('besi@stille.ch', 'Stille Spitex Seeland');
		const spitex = await env.api.contacts.list();
		assert.ok(physio.length > 0 && spitex.length > 0);
		assert.equal(
			physio.some((contact) => spitex.some((other) => other.id === contact.id)),
			false,
		);
	});

	it('rejects actions the role does not allow', async () => {
		env.as('jonas.keller@stille.ch');
		await assert.rejects(
			env.api.tasks.list(),
			(error: MockApiError) => error.code === 'unauthorized' && error.message === '[error.unauthorized]',
		);
		assert.ok((await env.api.invoices.list()).length > 0);
	});

	it('rejects stale writes with a conflict', async () => {
		env.as('besi@stille.ch');
		const [contact] = await env.api.contacts.list();
		await env.api.contacts.update(contact.id, contact.revision, { notes: 'first' });
		await assert.rejects(
			env.api.contacts.update(contact.id, contact.revision, { notes: 'second' }),
			(error: MockApiError) => error.code === 'conflict',
		);
	});

	it('returns localized field errors from the shared schema', async () => {
		env.as('besi@stille.ch');
		const [contact] = await env.api.contacts.list();
		await assert.rejects(
			env.api.contacts.update(contact.id, contact.revision, { lastName: '', email: 'nope' }),
			(error: MockApiError) =>
				error.code === 'validation' &&
				error.fields.lastName === '[error.ws.required]' &&
				error.fields.email === '[error.ws.invalid_email]',
		);
		assert.equal(contactSchema.safeParse({ ...contact, email: 'a@b.ch' }).success, true);
	});

	it('writes an audit entry for every change and supports undo', async () => {
		env.as('besi@stille.ch');
		const before = env.db.table('audit').length;
		const [task] = await env.api.tasks.list();
		await env.api.tasks.remove(task.id);
		await env.api.tasks.restore(task);
		const entries = env.db.table('audit').slice(before);
		assert.deepEqual(
			entries.map((entry) => entry.action),
			['task.deleted', 'task.restored'],
		);
		assert.ok((await env.api.tasks.list()).some((row) => row.id === task.id));
	});

	it('fails on purpose when offline or when the failure rate hits', async () => {
		env.as('besi@stille.ch');
		env.conditions.offline = true;
		await assert.rejects(env.api.contacts.list(), (error: MockApiError) => error.code === 'offline');
		env.conditions.offline = false;
		env.conditions.failureRate = 1;
		await assert.rejects(env.api.contacts.list(), (error: MockApiError) => error.code === 'internal');
	});

	it('rolls back a write when browser storage is full', async () => {
		env.as('besi@stille.ch');
		const [contact] = await env.api.contacts.list();
		env.storage.limit = 10;
		await assert.rejects(
			env.api.contacts.update(contact.id, contact.revision, { notes: 'x' }),
			(error: MockApiError) => error.code === 'storage_full',
		);
		assert.equal(env.db.table('contacts').find((row) => row.id === contact.id)?.notes, contact.notes);
	});

	it('survives a reload from storage', async () => {
		env.as('besi@stille.ch');
		const [contact] = await env.api.contacts.list();
		await env.api.contacts.update(contact.id, contact.revision, { notes: 'persisted' });
		const reloaded = new MockDatabase({
			storage: env.storage,
			seed: () => createSeed(),
			conditions: () => env.conditions,
			localize,
			sleep: async () => undefined,
		});
		assert.equal(reloaded.table('contacts').find((row) => row.id === contact.id)?.notes, 'persisted');
	});
});

describe('account API', () => {
	it('signs in with the demo password only', async () => {
		const env = setup();
		await assert.rejects(
			env.account.signIn('besi@stille.ch', 'wrong'),
			(error: MockApiError) => error.message === '[error.invalid_credentials]',
		);
		assert.equal((await env.account.signIn('BESI@stille.ch', demoPassword)).firstName, 'Besi');
	});

	it('protects the last active administrator', async () => {
		const env = setup();
		env.as('besi@stille.ch', 'Stille Physio');
		const { members, roles } = await env.account.members();
		const me = members.find((member) => member.user.email === 'besi@stille.ch')!;
		const user = roles.find((role) => role.kind === 'user')!;
		await assert.rejects(
			env.account.changeMember(me.membership.id, { roleId: user.id }),
			(error: MockApiError) => error.message === '[error.ws.last_administrator]',
		);
	});

	it('runs the invitation flow end to end', async () => {
		const env = setup();
		env.as('besi@stille.ch', 'Stille Physio');
		const { roles } = await env.account.members();
		const invitation = await env.account.invite('neu@example.ch', roles.find((role) => role.kind === 'user')!.id);
		await assert.rejects(
			env.account.invite('sandra.roth@stille.ch', invitation.roleId),
			(error: MockApiError) => error.fields.email === '[error.ws.already_member]',
		);
		const details = await env.account.invitationDetails(invitation.id);
		assert.equal(details.tenantName, 'Stille Physio');
		assert.equal(details.existingUser, false);
		await env.account.acceptInvitation(invitation.id, { firstName: 'Neu', lastName: 'Person' });
		assert.equal((await env.account.signIn('neu@example.ch', demoPassword)).firstName, 'Neu');
		await assert.rejects(env.account.invitationDetails(invitation.id));
	});

	it('keeps the protected roles unchanged', async () => {
		const env = setup();
		env.as('besi@stille.ch', 'Stille Physio');
		const { roles } = await env.account.members();
		const administrator = roles.find((role) => role.kind === 'administrator')!;
		await assert.rejects(
			env.account.saveRole({ id: administrator.id, name: 'X', permissions: [] }),
			(error: MockApiError) => error.message === '[error.ws.protected_role]',
		);
		const custom = await env.account.saveRole({ id: null, name: 'Praktikum', permissions: ['contacts.read'] });
		await env.account.deleteRole(custom.id);
	});

	it('only lets super administrators into the platform view', async () => {
		const env = setup();
		env.as('besi@stille.ch');
		await assert.rejects(env.account.platformTenants());
		env.as('admin@clinks.ch');
		assert.equal((await env.account.platformTenants()).length, 2);
	});
});
