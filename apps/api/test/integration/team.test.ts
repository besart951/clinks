import assert from 'node:assert/strict';
import { afterAll, beforeAll, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api?.stop();
});

const visit = (assigneeId: string, start: string) => ({
	title: 'Grundpflege',
	kind: 'spitex',
	status: 'planned',
	assignee_id: assigneeId,
	starts_at: start,
	ends_at: new Date(Date.parse(start) + 45 * 60_000).toISOString(),
	location: '',
	notes: '',
});

it('shows sign-in activity, signs a person out, and hands back their future visits on deactivation', async () => {
	const admin = await api.administrator('team-admin@example.ch', 'Team AG');
	const call = (method: string, path: string, body?: unknown) =>
		admin.browser.call(method, path, { token: admin.token, body });

	// A nurse who joins the workspace and signs in there.
	const nurse = await api.signedUp('team-nurse@example.ch');
	const roleId = uuid();
	await api.owner
		.insertInto('roles')
		.values({ id: roleId, tenantId: admin.tenantId, kind: 'custom', name: 'Pflege', permissions: ['spitex.own.read'] })
		.execute();
	const userId = (
		await api.owner
			.selectFrom('users')
			.select('id')
			.where('email', '=', 'team-nurse@example.ch')
			.executeTakeFirstOrThrow()
	).id;
	const membershipId = uuid();
	await api.owner
		.insertInto('memberships')
		.values({ id: membershipId, tenantId: admin.tenantId, userId, roleId })
		.execute();
	const switched = await nurse.browser.call('POST', '/me/tenant', {
		token: nurse.token,
		body: { tenantId: admin.tenantId },
	});
	assert.equal(switched.status, 200, JSON.stringify(switched.body));
	const nurseToken = switched.body.accessToken as string;

	const team = (await call('GET', '/tenant/team')).body;
	const row = team.people.find((person: { user: { id: string } }) => person.user.id === userId);
	assert.equal(row.access.devices, 1);
	assert.ok(row.access.lastActiveAt);
	// The nurse herself does not see the activity of others.
	assert.equal((await nurse.browser.call('GET', '/tenant/team', { token: nurseToken })).status, 403);

	// Signed out from all devices: the nurse's token stops working at once.
	assert.equal((await call('POST', `/tenant/members/${membershipId}/sign-out`)).status, 204);
	assert.equal((await nurse.browser.call('GET', '/me', { token: nurseToken })).status, 401);
	const after = (await call('GET', '/tenant/team')).body;
	assert.equal(after.people.find((person: { user: { id: string } }) => person.user.id === userId).access.devices, 0);

	// Deactivated: future visits go back to the open visits, past ones stay with her.
	const [past, future] = [uuid(), uuid()];
	const written = await call('POST', '/sync/write', {
		ops: [
			{ op: 'PUT', table: 'appointments', id: past, data: visit(userId, '2025-03-03T08:00:00.000Z') },
			{ op: 'PUT', table: 'appointments', id: future, data: visit(userId, '2027-03-01T08:00:00.000Z') },
		],
	});
	assert.equal(written.status, 200, JSON.stringify(written.body));
	assert.equal(
		(await call('POST', '/tenant/members/' + membershipId, { status: 'inactive', releaseVisits: true })).status,
		204,
	);
	const visits = await api.owner
		.selectFrom('appointments')
		.select(['id', 'assigneeId'])
		.where('id', 'in', [past, future])
		.execute();
	assert.equal(visits.find((visit) => visit.id === past)?.assigneeId, userId);
	assert.equal(visits.find((visit) => visit.id === future)?.assigneeId, null);

	assert.equal((await call('POST', '/tenant/members/' + membershipId, { roleId: team.roles[0].id })).status, 204);
	const log = await api.owner
		.selectFrom('audit')
		.select(['action', 'meta'])
		.where('tenantId', '=', admin.tenantId)
		.where('target', '=', membershipId)
		.orderBy('createdAt')
		.execute();
	assert.deepEqual(
		log.map((entry) => entry.action),
		['membership.signed_out', 'membership.deactivated', 'membership.role_changed'],
	);
	assert.deepEqual(log[1].meta, { devices: 0, visits: 1 });
	assert.equal((log[2].meta as { from: string }).from, 'Pflege');
});
