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

it('adds the role templates of booked products, hides them without the product and resets them', async () => {
	const admin = await api.administrator('roles-admin@example.ch', 'Home-Care24');
	const call = (method: string, path: string, body?: unknown) =>
		admin.browser.call(method, path, { token: admin.token, body });
	const team = (await call('GET', '/tenant/team')).body;
	const byTemplate = (key: string) => team.roles.find((role: { template: string | null }) => role.template === key);
	const care = byTemplate('spitex.care');
	assert.equal(care.name, 'Spitex-Pflege');
	assert.deepEqual(care.permissions, ['spitex.own.read']);
	assert.ok(byTemplate('physio.therapy'));

	// Changed, then back to the template; name and id stay.
	assert.equal(
		(
			await call('POST', '/tenant/roles', {
				id: care.id,
				name: 'Pflege',
				permissions: ['spitex.own.read', 'contacts.read'],
			})
		).status,
		200,
	);
	assert.equal((await call('POST', `/tenant/roles/${care.id}/reset`)).status, 204);
	const reset = (await call('GET', '/tenant/team')).body.roles.find((role: { id: string }) => role.id === care.id);
	assert.equal(reset.name, 'Pflege');
	assert.deepEqual(reset.permissions, ['spitex.own.read']);

	// Without Physio its templates cannot be given to anyone.
	await api.owner
		.updateTable('tenants')
		.set({ enabledModules: ['planner', 'mail', 'finance', 'spitex'] })
		.where('id', '=', admin.tenantId)
		.execute();
	const therapy = byTemplate('physio.therapy');
	const invited = await call('POST', '/tenant/invitations', { email: 'therapist@example.ch', roleId: therapy.id });
	assert.equal(invited.status, 409, JSON.stringify(invited.body));
	assert.equal((await call('POST', '/tenant/invitations', { email: 'nurse@example.ch', roleId: care.id })).status, 201);
});
