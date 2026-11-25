import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config.ts';
import { recoveryCode, SecretBox } from '../../src/crypto.ts';
import { pickLocale, translate } from '../../src/i18n.ts';
import { RateLimiter } from '../../src/rate-limit.ts';
import { TokenService } from '../../src/tokens.ts';

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

describe('CORS and ALLOWED_ORIGINS', () => {
	it('parses ALLOWED_ORIGINS and allows only listed origins', async () => {
		const config = loadConfig({ ALLOWED_ORIGINS: 'http://tauri.localhost, https://desktop.example.ch ' });
		assert.deepEqual(config.ALLOWED_ORIGINS, ['http://tauri.localhost', 'https://desktop.example.ch']);
		const app = createApp({
			config,
			services: {
				db: {} as never,
				secrets: SecretBox.ephemeral(),
				tokens: await TokenService.create({ issuer: 'http://test', audience: 'clinks' }),
				mailer: { send: async () => {} },
				limiter: new RateLimiter(),
				config,
				now: () => new Date(),
			},
		});
		const allowed = await app.request('/.well-known/jwks.json', { headers: { Origin: 'http://tauri.localhost' } });
		expect(allowed.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost');
		const blocked = await app.request('/.well-known/jwks.json', { headers: { Origin: 'https://evil.example.com' } });
		expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
	});
});
