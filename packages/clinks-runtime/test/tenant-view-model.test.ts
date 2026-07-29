import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Polyfill Svelte 5 compiler macro for Node unit tests
(globalThis as any).$state ??= (v: any) => v;

import { TenantViewModel } from '../src/tenant-view-model.svelte.ts';

describe('TenantViewModel', () => {
	it('loads tenants from client', async () => {
		const mockClient = {
			tenants: async () => [{ id: 't1', name: 'Tenant 1' }],
			createTenant: async () => ({ id: 't2', name: 'Tenant 2' }),
		};
		let lastError = '';
		const model = new TenantViewModel(mockClient, { message: (e) => String(e) }, (msg) => (lastError = msg));

		await model.load();
		assert.equal(model.tenants.length, 1);
		assert.equal(model.tenants[0].name, 'Tenant 1');
	});

	it('creates tenant and resets tenantName', async () => {
		let created = false;
		const mockClient = {
			tenants: async () => (created ? [{ id: 't1', name: 'New Tenant' }] : []),
			createTenant: async () => {
				created = true;
				return { id: 't1', name: 'New Tenant' };
			},
		};
		let lastError = '';
		const model = new TenantViewModel(mockClient, { message: (e) => String(e) }, (msg) => (lastError = msg));

		model.tenantName = 'New Tenant';
		await model.createTenant();
		assert.equal(model.tenantName, '');
		assert.equal(model.tenants.length, 1);
		assert.equal(lastError, '');
	});

	it('clears state on clear()', () => {
		const model = new TenantViewModel(
			{ tenants: async () => [], createTenant: async () => ({ id: '', name: '' }) },
			{ message: (e) => String(e) },
			() => undefined,
		);

		model.tenantName = 'Draft';
		model.clear();
		assert.equal(model.tenantName, '');
		assert.equal(model.tenants.length, 0);
	});
});
