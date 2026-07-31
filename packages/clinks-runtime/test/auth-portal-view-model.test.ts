import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;
(globalThis as any).$derived ??= (v: any) => (typeof v === 'function' ? v() : v);

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

		let storedSession: unknown = null;
		const mockSession = {
			get current() {
				return storedSession as any;
			},
			async hydrate() {
				storedSession = null;
			},
			async login() {
				storedSession = session;
			},
			async register() {
				storedSession = session;
			},
			async acceptInvitation() {
				storedSession = session;
			},
			async switchTenant() {
				storedSession = session;
			},
			async logout() {
				storedSession = null;
			},
			get isAuthenticated() {
				return storedSession != null;
			},
			get email() {
				return (storedSession as any)?.user?.email ?? '';
			},
			get memberships() {
				return (storedSession as any)?.memberships ?? [];
			},
			get activeTenant() {
				return (storedSession as any)?.activeTenant;
			},
		};

		const mockClient = {
			createInvitation: async () => ({
				id: 'inv-1',
				tenantId: 't1',
				email: 'invited@test.com',
				role: 'ROLE_USER' as const,
				expiresAt: '2026-12-31T00:00:00Z',
				acceptanceUrl: 'http://localhost/accept',
				deliveryStatus: 'sent' as const,
			}),
		};

		const mockClipboard = { copy: async () => undefined };
		const model = new AuthPortalViewModel(
			'planer_link',
			mockClient,
			mockSession as any,
			{ message: (e) => String(e) },
			mockClipboard,
		);

		await model.initialize();
		assert.equal(storedSession, null);

		model.authAccess.email = 'user@clinks.test';
		model.authAccess.password = 'password123456';
		await model.authAccess.submit();

		assert.notEqual(storedSession, null);
		assert.equal(model.sessionEmail, 'user@clinks.test');
		assert.equal(model.canInviteMembers, true);
		assert.equal(model.authDashboard.selectedTenant, 't1');
	});
});
