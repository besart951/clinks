import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { permissions } from '../src/types.ts';
import {
	dormantProducts,
	productBooked,
	productOf,
	rightGroups,
	roleAvailable,
	templatesFor,
} from '../src/products.ts';

const business = { plan: 'business' as const, enabledModules: ['planner', 'mail', 'finance', 'spitex'] as const };
const tenant = { ...business, enabledModules: [...business.enabledModules] };

describe('product catalogue', () => {
	it('puts every right in exactly one product', () => {
		for (const permission of permissions) assert.ok(productOf(permission));
		const grouped = rightGroups().flatMap((group) => group.areas.flatMap((area) => [area.read, area.write]));
		assert.deepEqual(grouped.filter(Boolean).sort(), [...permissions].sort());
	});

	it('books the basics always and a product only with its module', () => {
		assert.equal(productBooked(tenant, 'core'), true);
		assert.equal(productBooked(tenant, 'admin'), true);
		assert.equal(productBooked(tenant, 'spitex'), true);
		assert.equal(productBooked(tenant, 'physio'), false);
		assert.equal(productBooked({ ...tenant, plan: 'starter' }, 'spitex'), false);
	});

	it('offers templates of booked products only and hides the others', () => {
		assert.deepEqual(
			templatesFor(tenant.enabledModules).map((template) => template.key),
			['spitex.lead', 'spitex.planning', 'spitex.care'],
		);
		assert.equal(roleAvailable({ template: 'spitex.care' }, tenant), true);
		assert.equal(roleAvailable({ template: 'physio.therapy' }, tenant), false);
		assert.equal(roleAvailable({ template: null }, tenant), true);
	});

	it('names the products whose rights rest', () => {
		assert.deepEqual(dormantProducts(['contacts.read', 'physio.read', 'spitex.read'], tenant), ['physio']);
	});
});
