import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;
(globalThis as any).$derived ??= (v: any) => (typeof v === 'function' ? v() : v);

import { TenantViewModel } from '../src/tenant-view-model.svelte.ts';

describe('TenantViewModel', () => {
	it('loads tenants from client', async () => {
		const mockService = {
			tenants: async () => [{ id: 't1', name: 'Tenant 1' }],
			createTenant: async () => ({ id: 't2', name: 'Tenant 2' }),
		};
		const model = new TenantViewModel(mockService, { message: (e) => String(e) });

		await model.load();
		assert.equal(model.tenants.data!.length, 1);
		assert.equal(model.tenants.data![0].name, 'Tenant 1');
	});

	it('creates tenant and resets tenantName', async () => {
		let created = false;
		const mockService = {
			tenants: async () => (created ? [{ id: 't1', name: 'New Tenant' }] : []),
			createTenant: async () => {
				created = true;
				return { id: 't1', name: 'New Tenant' };
			},
		};
		const model = new TenantViewModel(mockService, { message: (e) => String(e) });

		model.tenantName = 'New Tenant';
		await model.createTenant();
		assert.equal(model.tenantName, '');
		assert.equal(model.tenants.data!.length, 1);
		assert.equal(model.error, '');
	});

	it('reverts on create failure', async () => {
		const mockService = {
			tenants: async () => [{ id: 't1', name: 'Existing' }],
			createTenant: async () => {
				throw new Error('fail');
			},
		};
		const model = new TenantViewModel(mockService, { message: (e) => String(e) });
		model.tenants.data = [{ id: 't1', name: 'Existing' }];

		model.tenantName = 'Will Fail';
		await model.createTenant();
		assert.equal(model.tenantName, 'Will Fail'); // restored on revert
		assert.equal(model.tenants.data!.length, 1); // snapshot restored
		assert.notEqual(model.error, '');
	});

	it('clears state on clear()', () => {
		const model = new TenantViewModel(
			{ tenants: async () => [], createTenant: async () => ({ id: '', name: '' }) },
			{ message: (e) => String(e) },
		);

		model.tenantName = 'Draft';
		model.clear();
		assert.equal(model.tenantName, '');
		assert.equal(model.tenants.data, null);
	});
});
