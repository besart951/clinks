import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { orderAt, orderGap, spacedOrders } from '../src/ordering.ts';

describe('ordering', () => {
	it('places an item between, before or after its neighbours', () => {
		assert.equal(orderAt([], 0), 0);
		assert.equal(orderAt([0, 1024], 1), 512);
		assert.equal(orderAt([0, 1024], 0), -orderGap);
		assert.equal(orderAt([0, 1024], 2), 1024 + orderGap);
	});

	it('asks for renumbering when no integer fits', () => {
		assert.equal(orderAt([3, 4], 1), null);
		assert.deepEqual(spacedOrders(3), [0, 1024, 2048]);
	});
});
