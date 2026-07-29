import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;

import { AuthPortalViewModel } from '../src/auth-portal-view-model.svelte.ts';

describe('AuthPortalViewModel', () => {
	it('handles login and hydrates session across sub-models', async () => {
		const session = {
			user: { id: 'u1', email: 'user@clinks.test', locale: 'de-CH', isSuperAdmin: false },
			activeTenant: { id: 't1', name: 'Tenant One' },
			memberships: [
				{
					id: 'm1',
					tenant: { id: 't1', name: 'Tenant One' },
					role: 'ROLE_TENANT_ADMIN' as const,
					status: 'ACTIVE' as const,
				},
			],
		};

		const mockClient = {
			getSession: async () => null,
			login: async () => session,
			acceptInvitation: async () => session,
			createInvitation: async () => ({
				id: 'inv-1',
				tenantId: 't1',
				email: 'invited@test.com',
				role: 'ROLE_USER' as const,
				expiresAt: '2026-12-31T00:00:00Z',
				acceptanceUrl: 'http://localhost/accept',
				deliveryStatus: 'sent' as const,
			}),
			logout: async () => undefined,
			register: async () => session,
			switchTenant: async () => session,
		};

		const mockClipboard = { copy: async () => undefined };
		const model = new AuthPortalViewModel('planer_link', mockClient, { message: (e) => String(e) }, mockClipboard);

		await model.initialize();
		assert.equal(model.session, null);

		model.authAccess.email = 'user@clinks.test';
		model.authAccess.password = 'password123456';
		await model.authAccess.submit();

		assert.notEqual(model.session, null);
		assert.equal(model.sessionEmail, 'user@clinks.test');
		assert.equal(model.canInviteMembers, true);
		assert.equal(model.authDashboard.selectedTenant, 't1');
	});
});
