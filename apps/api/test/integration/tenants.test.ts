import assert from 'node:assert/strict';
import { inScope } from '@clinks/db/scope';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { password, startApi, type Api } from './harness.ts';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(async () => {
	await api?.stop();
});

describe('tenants', () => {
	it('creates a tenant at onboarding with the caller as administrator', async () => {
		const { token, tenantId } = await api.administrator('owner@example.ch', 'Praxis Nord');
		const me = await api.client().call('GET', '/me', { token });
		assert.equal(me.body.tenantId, tenantId);
		assert.deepEqual(
			me.body.tenants.map((tenant: { name: string }) => tenant.name),
			['Praxis Nord'],
		);
		const role = me.body.roles.find((candidate: { id: string }) => candidate.id === me.body.memberships[0].roleId);
		assert.equal(role.kind, 'administrator');
		const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
		assert.equal(claims.tenant_id, tenantId);
		assert.equal(claims.role, role.id);
	});

	it('refuses to switch into a tenant without membership', async () => {
		const a = await api.administrator('switch-a@example.ch', 'Tenant A');
		const b = await api.administrator('switch-b@example.ch', 'Tenant B');
		const result = await a.browser.call('POST', '/me/tenant', { token: a.token, body: { tenantId: b.tenantId } });
		assert.equal(result.status, 401);
	});
});

describe('tenant isolation', () => {
	it('keeps one tenant out of another tenant’s invitations and roles', async () => {
		const a = await api.administrator('iso-a@example.ch', 'Isolation A');
		const b = await api.administrator('iso-b@example.ch', 'Isolation B');
		const bRoles = (await api.client().call('GET', '/me', { token: b.token })).body.roles;
		const bInvite = await api
			.client()
			.call('POST', '/tenant/invitations', { token: b.token, body: { email: 'x@example.ch', roleId: bRoles[0].id } });
		assert.equal(bInvite.status, 201);

		const listed = await api.client().call('GET', '/tenant/invitations', { token: a.token });
		assert.deepEqual(listed.body, [], 'A sees none of B’s invitations');
		const withForeignRole = await api
			.client()
			.call('POST', '/tenant/invitations', { token: a.token, body: { email: 'y@example.ch', roleId: bRoles[0].id } });
		assert.equal(withForeignRole.status, 404, 'B’s role does not exist for A');
		const revoke = await api.client().call('DELETE', `/tenant/invitations/${bInvite.body.id}`, { token: a.token });
		assert.equal(revoke.status, 404, 'B’s invitation does not exist for A');
		const stillThere = await api.client().call('GET', '/tenant/invitations', { token: b.token });
		assert.equal(stillThere.body[0].status, 'pending');
	});

	it('stops the database itself from mixing tenants, even for an unfiltered query', async () => {
		const a = await api.administrator('db-a@example.ch', 'Database A');
		const b = await api.administrator('db-b@example.ch', 'Database B');
		const visible = await inScope(api.db, { tenantId: a.tenantId, userId: null }, (tx) =>
			tx.selectFrom('memberships').select('tenantId').execute(),
		);
		assert.deepEqual([...new Set(visible.map((row) => row.tenantId))], [a.tenantId]);
		assert.ok(!visible.some((row) => row.tenantId === b.tenantId));
	});

	it('lets only members with team rights invite', async () => {
		const owner = await api.administrator('rights@example.ch', 'Rights AG');
		const roles = (await api.client().call('GET', '/me', { token: owner.token })).body.roles;
		const userRoleId = (
			await api.owner.selectFrom('roles').select(['id', 'kind']).where('tenantId', '=', owner.tenantId).execute()
		).find((role) => role.kind === 'user')!.id;
		const invited = await api.client().call('POST', '/tenant/invitations', {
			token: owner.token,
			body: { email: 'staff@example.ch', roleId: userRoleId },
		});
		assert.equal(invited.status, 201);
		const staff = api.client();
		const accepted = await staff.call('POST', `/invitations/${api.linkTokenIn('staff@example.ch')}/accept`, {
			body: { firstName: 'Sara', lastName: 'Staff', password },
		});
		const attempt = await staff.call('POST', '/tenant/invitations', {
			token: accepted.body.session.accessToken,
			body: { email: 'friend@example.ch', roleId: roles[0].id },
		});
		assert.equal(attempt.status, 403);
	});
});

describe('invitations', () => {
	it('lets a new address join with a password and signs it in', async () => {
		const owner = await api.administrator('inviter@example.ch', 'Spitex Süd');
		const roleId = (await api.client().call('GET', '/me', { token: owner.token })).body.roles[0].id;
		await api
			.client()
			.call('POST', '/tenant/invitations', { token: owner.token, body: { email: 'new@example.ch', roleId } });
		const link = api.linkTokenIn('new@example.ch');
		assert.match(api.mailer.last('new@example.ch').text, /Spitex Süd/);

		const details = await api.client().call('GET', `/invitations/${link}`);
		assert.equal(details.body.tenantName, 'Spitex Süd');
		assert.equal(details.body.hasAccount, false);
		const browser = api.client();
		const accepted = await browser.call('POST', `/invitations/${link}/accept`, {
			body: { firstName: 'Nina', lastName: 'Neu', password },
		});
		assert.equal(accepted.status, 200);
		assert.equal(accepted.body.tenantId, owner.tenantId);
		const me = await browser.call('GET', '/me', { token: accepted.body.session.accessToken });
		assert.equal(me.body.tenantId, owner.tenantId);
		assert.equal(me.body.user.emailVerified, true);

		assert.equal((await api.client().call('GET', `/invitations/${link}`)).status, 404, 'a used link stops working');
	});

	it('makes an existing account sign in as the invited address', async () => {
		const owner = await api.administrator('inviter2@example.ch', 'Physio Ost');
		const roleId = (await api.client().call('GET', '/me', { token: owner.token })).body.roles[0].id;
		const existing = await api.signedUp('member@example.ch');
		const stranger = await api.signedUp('stranger@example.ch');
		await api
			.client()
			.call('POST', '/tenant/invitations', { token: owner.token, body: { email: 'member@example.ch', roleId } });
		const link = api.linkTokenIn('member@example.ch');
		assert.equal((await api.client().call('GET', `/invitations/${link}`)).body.hasAccount, true);

		const asStranger = await api
			.client()
			.call('POST', `/invitations/${link}/accept`, { token: stranger.token, body: { firstName: 'S', lastName: 'T' } });
		assert.equal(asStranger.status, 403);
		const asMember = await api
			.client()
			.call('POST', `/invitations/${link}/accept`, { token: existing.token, body: { firstName: 'M', lastName: 'M' } });
		assert.equal(asMember.status, 200);
		assert.equal(asMember.body.session, undefined, 'the member keeps their own session');
		const switched = await api
			.client()
			.call('POST', '/me/tenant', { token: existing.token, body: { tenantId: owner.tenantId } });
		assert.equal(switched.status, 200);
	});

	it('refuses to invite a member twice', async () => {
		const owner = await api.administrator('twice@example.ch', 'Twice GmbH');
		const roleId = (await api.client().call('GET', '/me', { token: owner.token })).body.roles[0].id;
		const result = await api
			.client()
			.call('POST', '/tenant/invitations', { token: owner.token, body: { email: 'twice@example.ch', roleId } });
		assert.equal(result.status, 409);
	});
});
