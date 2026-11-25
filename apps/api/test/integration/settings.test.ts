import assert from 'node:assert/strict';
import { afterAll, beforeAll, it } from 'vitest';
import { startApi, type Api } from './harness.ts';
let api: Api;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api?.stop();
});
it('persists company and profile edits, isolates the team and keeps an active administrator', async () => {
	const a = await api.administrator('settings-a@example.ch', 'A');
	const b = await api.administrator('settings-b@example.ch', 'B');
	const call = (method: string, path: string, body?: unknown) => a.browser.call(method, path, { token: a.token, body });
	assert.equal(
		(
			await call('POST', '/tenant/settings', {
				address: { street: 'Weg', houseNumber: '8', zip: '6000', city: 'Luzern' },
			})
		).status,
		204,
	);
	assert.equal(
		(
			await call('POST', '/me/profile', {
				firstName: 'Erika',
				notificationPreferences: { inApp: true, email: false, push: false, digest: 'never' },
			})
		).status,
		204,
	);
	const me = (await call('GET', '/me')).body;
	assert.equal(me.tenants[0].address.city, 'Luzern');
	assert.equal(me.user.firstName, 'Erika');
	assert.equal(me.user.notificationPreferences.email, false);
	const team = (await call('GET', '/tenant/team')).body;
	assert.equal(team.people.length, 1);
	const member = team.people[0].membership.id;
	assert.equal((await call('POST', '/tenant/members/' + member, { status: 'inactive' })).status, 409);
	assert.equal(
		(await b.browser.call('POST', '/tenant/members/' + member, { token: b.token, body: { jobTitle: 'Other' } })).status,
		404,
	);
	assert.equal((await call('POST', '/tenant/settings', { plan: 'business' })).status, 400);
});
