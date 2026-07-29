import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;

import { AdminDashboardViewModel } from '../src/admin-dashboard-view-model.svelte.ts';

describe('AdminDashboardViewModel', () => {
	it('initializes super admin session and loads sub-models', async () => {
		const mockClient = {
			getSession: async () => ({
				user: { id: 'usr-admin', email: 'admin@clinks.test', locale: 'de-CH', isSuperAdmin: true },
				memberships: [],
			}),
			adminLanguages: async () => [{ code: 'de-CH', name: 'German', isDefault: true }],
			tenants: async () => [{ id: 't1', name: 'Tenant Alpha' }],
			auditEvents: async () => ({ events: [], nextCursor: '' }),
			adminLogin: async () => {
				throw new Error('Not used');
			},
			createTenant: async () => {
				throw new Error('Not used');
			},
			logout: async () => undefined,
			saveTranslation: async () => undefined,
		};

		const model = new AdminDashboardViewModel(
			mockClient,
			{ message: (e) => String(e) },
			async () => undefined,
			() => 'de-CH',
		);

		await model.initialize();
		assert.equal(model.isSuperAdministrator, true);
		assert.equal(model.sessionEmail, 'admin@clinks.test');
		assert.equal(model.tenantModel.tenants.length, 1);
		assert.equal(model.localizationModel.managedLanguages.length, 1);
	});
});
