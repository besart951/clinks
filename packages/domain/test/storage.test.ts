import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { connectionDefaults, dataLocation, needsLocationConsent, parseR2Endpoint, r2Endpoint } from '../src/storage.ts';

const account = '0123456789abcdef0123456789abcdef';

describe('storage', () => {
	it('builds and parses Cloudflare R2 endpoints per jurisdiction', () => {
		assert.equal(r2Endpoint(account, 'eu'), `https://${account}.eu.r2.cloudflarestorage.com`);
		assert.deepEqual(parseR2Endpoint(r2Endpoint(account.toUpperCase(), 'default')), {
			accountId: account,
			jurisdiction: 'default',
		});
		assert.equal(parseR2Endpoint('https://s3.pub1.infomaniak.cloud'), null);
	});

	it('knows where each provider keeps the data', () => {
		assert.equal(dataLocation('clinks', ''), 'switzerland');
		assert.equal(dataLocation('infomaniak', 'https://s3.pub2.infomaniak.cloud'), 'switzerland');
		assert.equal(dataLocation('cloudflare', r2Endpoint(account, 'eu')), 'eu');
		assert.equal(dataLocation('cloudflare', r2Endpoint(account, 'default')), 'unknown');
		assert.equal(dataLocation('custom', 'https://s3.example.ch'), 'unknown');
	});

	it('asks for consent only when health data would leave Switzerland', () => {
		assert.equal(needsLocationConsent('eu', ['contacts', 'physio']), true);
		assert.equal(needsLocationConsent('eu', ['contacts', 'finance']), false);
		assert.equal(needsLocationConsent('switzerland', ['spitex']), false);
	});

	it('fills Infomaniak defaults with region, endpoint and path-style URLs', () => {
		assert.deepEqual(connectionDefaults('infomaniak'), {
			region: 'dc3-a',
			endpoint: 'https://s3.pub1.infomaniak.cloud',
			bucket: '',
			accessKeyId: '',
			pathStyle: true,
		});
		assert.equal(connectionDefaults('cloudflare').region, 'auto');
	});
});
