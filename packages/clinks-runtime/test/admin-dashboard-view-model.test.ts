import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;
(globalThis as any).$derived ??= (v: any) => (typeof v === 'function' ? v() : v);

import { AdminDashboardViewModel } from '../src/admin-dashboard-view-model.svelte.ts';

describe('AdminDashboardViewModel', () => {
	it('loads overview section and detects super admin', async () => {
		const mockClient = {
			adminLanguages: async () => [{ code: 'de-CH', name: 'German', isDefault: true }],
			tenants: async () => [{ id: 't1', name: 'Tenant Alpha' }],
			auditEvents: async () => ({ events: [], nextCursor: '' }),
			createTenant: async () => {
				throw new Error('Not used');
			},
			saveTranslation: async () => undefined,
			systemStats: async () => ({ userCount: 1, tenantCount: 1, pendingInvitationCount: 0, activeLanguageCount: 2 }),
			listUsers: async () => ({ users: [], nextCursor: '' }),
			listInvitations: async () => ({ invitations: [], nextCursor: '' }),
			getUser: async () => {
				throw new Error('Not used');
			},
			revokeInvitation: async () => {
				throw new Error('Not used');
			},
		};
		const mockSession = {
			current: {
				user: {
					id: 'usr-admin',
					email: 'admin@clinks.test',
					locale: 'de-CH',
					globalRole: 'super_administrator' as const,
				},
				memberships: [],
			},
		};

		const model = new AdminDashboardViewModel(
			mockClient as any,
			mockSession,
			{ message: (e) => String(e) },
			async () => undefined,
			() => 'de-CH',
		);

		assert.equal(model.isSuperAdministrator, true);
		assert.equal(model.sessionEmail, 'admin@clinks.test');

		await model.loadSection('dashboard');
		assert.equal(model.statsModel.stats.data!.userCount, 1);
	});

	it('lazy-loads tenant section only when navigated', async () => {
		const mockClient = {
			adminLanguages: async () => [],
			tenants: async () => [{ id: 't1', name: 'Tenant Alpha' }],
			auditEvents: async () => ({ events: [], nextCursor: '' }),
			createTenant: async () => {
				throw new Error('Not used');
			},
			saveTranslation: async () => undefined,
			systemStats: async () => ({ userCount: 0, tenantCount: 0, pendingInvitationCount: 0, activeLanguageCount: 0 }),
			listUsers: async () => ({ users: [], nextCursor: '' }),
			listInvitations: async () => ({ invitations: [], nextCursor: '' }),
			getUser: async () => {
				throw new Error('Not used');
			},
			revokeInvitation: async () => {
				throw new Error('Not used');
			},
		};
		const mockSession = {
			current: {
				user: {
					id: 'usr-admin',
					email: 'admin@clinks.test',
					locale: 'de-CH',
					globalRole: 'super_administrator' as const,
				},
				memberships: [],
			},
		};

		const model = new AdminDashboardViewModel(
			mockClient as any,
			mockSession,
			{ message: (e) => String(e) },
			async () => undefined,
			() => 'de-CH',
		);

		assert.equal(model.tenantModel.tenants.data, null);
		await model.loadSection('tenants');
		assert.equal(model.tenantModel.tenants.data!.length, 1);
	});
});
