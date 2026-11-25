import assert from 'node:assert/strict';
import { inScope } from '@clinks/db/scope';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
let adminId: string;

beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('plan-admin@example.ch', 'Spitex Plan AG');
	adminId = (
		await api.owner
			.selectFrom('memberships')
			.select('userId')
			.where('tenantId', '=', admin.tenantId)
			.executeTakeFirstOrThrow()
	).userId;
});

afterAll(async () => {
	await api?.stop();
});

function write(token: string, ops: unknown[]) {
	return api.client().call('POST', '/sync/write', { token, body: { ops } });
}

/** A second member of the admin's tenant with a custom role. */
async function member(email: string, permissions: string[]) {
	const { browser, token } = await api.signedUp(email);
	const roleId = uuid();
	await api.owner
		.insertInto('roles')
		.values({ id: roleId, tenantId: admin.tenantId, kind: 'custom', name: email, permissions })
		.execute();
	const user = await api.owner.selectFrom('users').select('id').where('email', '=', email).executeTakeFirstOrThrow();
	await api.owner
		.insertInto('memberships')
		.values({ id: uuid(), tenantId: admin.tenantId, userId: user.id, roleId })
		.execute();
	const switched = await browser.call('POST', '/me/tenant', { token, body: { tenantId: admin.tenantId } });
	assert.equal(switched.status, 200, JSON.stringify(switched.body));
	return { id: user.id, token: switched.body.accessToken as string };
}

const visit = (assigneeId: string | null, start: string, overrides: Record<string, unknown> = {}) => ({
	title: 'Grundpflege',
	kind: 'spitex',
	status: 'planned',
	assignee_id: assigneeId,
	starts_at: start,
	ends_at: new Date(Date.parse(start) + 45 * 60_000).toISOString(),
	location: '',
	notes: '',
	...overrides,
});

const release = (weekStart: string, releasedBy: string) => ({ week_start: weekStart, released_by: releasedBy });

/** What a user sees of the appointments under row-level security. */
function visible(userId: string) {
	return inScope(api.db, { tenantId: admin.tenantId, userId }, (tx) =>
		tx.selectFrom('appointments').select('id').orderBy('startsAt').execute(),
	).then((rows) => rows.map((row) => row.id));
}

describe('releasing the Spitex plan', () => {
	it('shows staff their own visits only once the week is released, and hides them again', async () => {
		const staff = await member('plan-staff@example.ch', ['spitex.own.read']);
		const [own, colleague, sundayNight, meeting, releaseId] = [uuid(), uuid(), uuid(), uuid(), uuid()];
		const created = await write(admin.token, [
			{ op: 'PUT', table: 'appointments', id: own, data: visit(staff.id, '2026-12-08T08:00:00.000Z') },
			{ op: 'PUT', table: 'appointments', id: colleague, data: visit(adminId, '2026-12-08T09:00:00.000Z') },
			// Sunday 23:30 in Zurich is 22:30 UTC: it belongs to the week before, not to the one that starts on the 7th.
			{ op: 'PUT', table: 'appointments', id: sundayNight, data: visit(staff.id, '2026-12-06T22:30:00.000Z') },
			{
				op: 'PUT',
				table: 'appointments',
				id: meeting,
				data: visit(staff.id, '2026-12-08T12:00:00.000Z', { kind: 'meeting' }),
			},
		]);
		assert.equal(created.status, 200, JSON.stringify(created.body));
		// Drafts: staff see nothing of the plan; other appointments keep the tenant-wide rule.
		assert.deepEqual(await visible(staff.id), [meeting]);
		assert.equal((await visible(adminId)).length, 4);

		const released = await write(admin.token, [
			{ op: 'PUT', table: 'spitex_week_releases', id: releaseId, data: release('2026-12-07', adminId) },
		]);
		assert.equal(released.status, 200, JSON.stringify(released.body));
		const flags = await api.owner.selectFrom('appointments').select(['id', 'published']).execute();
		assert.deepEqual(Object.fromEntries(flags.map((row) => [row.id, row.published])), {
			[own]: true,
			[colleague]: true,
			[sundayNight]: false,
			[meeting]: false,
		});
		assert.deepEqual(await visible(staff.id), [own, meeting]);

		// A visit planned into a released week is visible at once; moved out of it, it is a draft again.
		const late = uuid();
		await write(admin.token, [
			{ op: 'PUT', table: 'appointments', id: late, data: visit(staff.id, '2026-12-10T08:00:00.000Z') },
		]);
		assert.deepEqual(await visible(staff.id), [own, meeting, late]);
		await write(admin.token, [
			{
				op: 'PATCH',
				table: 'appointments',
				id: late,
				data: { starts_at: '2026-12-15T08:00:00.000Z', ends_at: '2026-12-15T08:45:00.000Z' },
			},
		]);
		assert.deepEqual(await visible(staff.id), [own, meeting]);
		// Reassigned to someone else, it leaves the first person's view.
		await write(admin.token, [{ op: 'PATCH', table: 'appointments', id: own, data: { assignee_id: adminId } }]);
		assert.deepEqual(await visible(staff.id), [meeting]);
		await write(admin.token, [{ op: 'PATCH', table: 'appointments', id: own, data: { assignee_id: staff.id } }]);

		const withdrawn = await write(admin.token, [{ op: 'DELETE', table: 'spitex_week_releases', id: releaseId }]);
		assert.equal(withdrawn.status, 200);
		assert.deepEqual(await visible(staff.id), [meeting]);
		assert.equal(
			(await api.owner.selectFrom('appointments').select('id').where('published', '=', true).execute()).length,
			0,
		);
		const actions = await api.owner.selectFrom('audit').select('action').where('target', '=', releaseId).execute();
		assert.deepEqual(actions.map((entry) => entry.action).sort(), ['plan.created', 'plan.deleted']);
	});

	it('lets only people with the release permission release, for a whole week and in their own name', async () => {
		const staff = await member('plan-reader@example.ch', ['spitex.own.read']);
		const planner = await member('plan-planner@example.ch', [
			'calendar.read',
			'calendar.write',
			'spitex.read',
			'spitex.write',
		]);
		const blind = await member('plan-blind@example.ch', ['spitex.release']);
		const put = (token: string, data: unknown, id = uuid()) =>
			write(token, [{ op: 'PUT', table: 'spitex_week_releases', id, data }]);
		assert.equal((await put(staff.token, release('2026-12-21', staff.id))).status, 403);
		assert.equal((await put(planner.token, release('2026-12-21', planner.id))).status, 403);
		// Releasing without seeing the plan would release unseen work.
		assert.equal((await put(blind.token, release('2026-12-21', blind.id))).status, 403);
		assert.equal((await put(admin.token, release('2026-12-21', staff.id))).status, 403);
		assert.equal((await put(admin.token, release('2026-12-22', adminId))).status, 400);
		const id = uuid();
		assert.equal((await put(admin.token, release('2026-12-21', adminId), id)).status, 200);
		assert.equal((await put(admin.token, release('2026-12-21', adminId))).status, 409);
		assert.equal(
			(
				await write(admin.token, [
					{ op: 'PATCH', table: 'spitex_week_releases', id, data: { week_start: '2026-12-28' } },
				])
			).status,
			403,
		);
		// The flag is the server's: an upload cannot publish a single visit.
		const sneaky = await write(admin.token, [
			{
				op: 'PUT',
				table: 'appointments',
				id: uuid(),
				data: { ...visit(adminId, '2027-01-05T08:00:00.000Z'), published: 1 },
			},
		]);
		assert.equal(sneaky.status, 400);
	});

	it('keeps Spitex visits to the planners: the calendar permission alone does not change them', async () => {
		const reception = await member('plan-reception@example.ch', ['calendar.read', 'calendar.write']);
		const id = uuid();
		await write(admin.token, [
			{ op: 'PUT', table: 'appointments', id, data: visit(adminId, '2027-02-02T08:00:00.000Z') },
		]);
		assert.equal(
			(
				await write(reception.token, [
					{ op: 'PUT', table: 'appointments', id: uuid(), data: visit(null, '2027-02-02T10:00:00.000Z') },
				])
			).status,
			403,
		);
		assert.equal((await visible(reception.id)).includes(id), false);
		// Who sees the plan but may not plan cannot remove a visit either.
		const viewer = await member('plan-viewer@example.ch', ['calendar.read', 'calendar.write', 'spitex.read']);
		assert.equal((await write(viewer.token, [{ op: 'DELETE', table: 'appointments', id }])).status, 403);
		await write(reception.token, [{ op: 'DELETE', table: 'appointments', id }]);
		// Unseen under row-level security, a patch has nothing to change.
		await write(reception.token, [{ op: 'PATCH', table: 'appointments', id, data: { title: 'X' } }]);
		assert.equal(
			(await api.owner.selectFrom('appointments').select('title').where('id', '=', id).executeTakeFirstOrThrow()).title,
			'Grundpflege',
		);
	});
});
