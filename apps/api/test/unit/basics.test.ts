import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { recoveryCode } from '../../src/crypto.ts';
import { pickLocale, translate } from '../../src/i18n.ts';
import { RateLimiter } from '../../src/rate-limit.ts';

describe('RateLimiter', () => {
	it('allows the limit per window, then resets', () => {
		let now = 0;
		const limiter = new RateLimiter(() => now);
		assert.deepEqual(
			[1, 2, 3].map(() => limiter.attempt('k', 2, 1000)),
			[true, true, false],
		);
		now = 1000;
		assert.equal(limiter.attempt('k', 2, 1000), true);
	});
});

describe('i18n', () => {
	it('picks the closest catalog language', () => {
		assert.equal(pickLocale('en-GB,en;q=0.8'), 'en-US');
		assert.equal(pickLocale('fr-CH'), 'de-CH');
		assert.equal(pickLocale(null), 'de-CH');
	});

	it('fills placeholders', () => {
		assert.match(translate('de-CH', 'mail.verify_email.body', { code: '123456' }), /123456/);
	});
});

describe('recovery codes', () => {
	it('have three groups of four unambiguous characters', () => {
		assert.match(recoveryCode(), /^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
	});
});
