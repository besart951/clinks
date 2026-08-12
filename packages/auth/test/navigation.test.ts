import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSafeInternalPath, returnToFromSearch, withReturnTo } from '../src/navigation.ts';

describe('auth navigation', () => {
	it('preserves a safe internal destination', () => {
		assert.equal(withReturnTo('/', '/projects/42?tab=plan'), '/?returnTo=%2Fprojects%2F42%3Ftab%3Dplan');
		assert.equal(returnToFromSearch('?returnTo=%2Fprojects%2F42', '/dashboard'), '/projects/42');
	});

	it('rejects external and protocol-relative return targets', () => {
		assert.equal(isSafeInternalPath('https://example.com'), false);
		assert.equal(isSafeInternalPath('//example.com'), false);
		assert.equal(returnToFromSearch('?returnTo=https%3A%2F%2Fexample.com', '/dashboard'), '/dashboard');
	});
});
