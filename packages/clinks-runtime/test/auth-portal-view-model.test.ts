import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const state = (value: any) => value;
state.raw = state;
(globalThis as any).$state ??= state;
(globalThis as any).$derived ??= (v: any) => (typeof v === 'function' ? v() : v);

import { AuthPortalViewModel } from '../src/auth-portal-view-model.svelte.ts';

describe('AuthPortalViewModel', () => {
	it('handles login and hydrates session across sub-models', async () => {
		const session = {
			user: { id: 'u1', email: 'user@clinks.test', locale: 'de-CH', globalRole: 'user' as const },
			activeTenant: { id: 't1', name: 'Tenant One', revision: 1n },
			memberships: [
				{
					id: 'm1',
					userId: 'u1',
					userEmail: 'user@clinks.test',
					tenant: { id: 't1', name: 'Tenant One', revision: 1n },
					role: {
						id: 'role-admin',
						name: 'Administrator',
						kind: 'administrator' as const,
						permissions: ['user.manage' as const, 'role.read' as const],
						revision: 1n,
					},
					status: 'active' as const,
					revision: 1n,
				},
			],
		};

		let storedSession: unknown = null;
		const mockSession = {
			get current() {
				return storedSession as any;
			},
			async initialize() {
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
			hasPermission(permission: string) {
				return session.memberships[0].role.permissions.includes(permission as any);
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
			roles: async () => [
				{
					id: 'role-user',
					tenantId: 't1',
					name: 'User',
					kind: 'user' as const,
					permissions: ['project.read' as const],
					revision: 1n,
					createdAt: '',
					updatedAt: '',
				},
			],
			createInvitation: async () => ({
				id: 'inv-1',
				tenantId: 't1',
				email: 'invited@test.com',
				role: {
					id: 'role-user',
					name: 'User',
					kind: 'user' as const,
					permissions: ['project.read' as const],
					revision: 1n,
				},
				status: 'pending' as const,
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
		assert.equal(model.authDashboard.selectedTenant, 't1');
		assert.equal(model.authDashboard.invitationRoleId, 'role-user');
	});
});
