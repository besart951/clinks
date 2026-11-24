import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { configChecks, report, type EnvFiles } from '../../src/ops-check.ts';
import { generatePrivateJwk } from '../../src/tokens.ts';

async function valid(): Promise<EnvFiles> {
	const jwks = 'https://api.clinks.ch/.well-known/jwks.json';
	return {
		api: {
			DATABASE_URL: 'postgres://clinks_api:secret@db.intern:5432/clinks',
			WEB_ORIGIN: 'https://app.clinks.ch',
			TOKEN_ISSUER: 'https://api.clinks.ch',
			TOKEN_AUDIENCE: 'clinks',
			SIGNING_KEY: JSON.stringify(await generatePrivateJwk()),
			STORAGE_SECRET_KEY: randomBytes(32).toString('base64'),
			S3_ENDPOINT: 'https://s3.pub1.infomaniak.cloud',
			S3_BUCKET: 'clinks-dokumente',
			AWS_ACCESS_KEY_ID: 'key',
			AWS_SECRET_ACCESS_KEY: 'secret',
			SMTP_URL: 'smtps://no-reply%40clinks.ch:pw@mail.infomaniak.com:465',
			STRIPE_SECRET_KEY: 'sk_live_x',
			STRIPE_WEBHOOK_SECRET: 'whsec_x',
			STRIPE_PRICES: '{"solo":{"month":"price_1"}}',
		},
		collab: {
			DATABASE_URL: 'postgres://clinks_api:secret@db.intern:5432/clinks',
			TOKEN_ISSUER: 'https://api.clinks.ch',
			TOKEN_AUDIENCE: 'clinks',
			JWKS_URL: jwks,
		},
		powersync: {
			PS_DATA_SOURCE_URI: 'postgres://clinks_replication:secret@db.intern:5432/clinks',
			PS_STORAGE_SOURCE_URI: 'postgres://powersync:secret@db.intern:5432/powersync_storage',
			PS_JWKS_URI: jwks,
			PS_ADMIN_TOKEN: randomBytes(32).toString('hex'),
		},
	};
}

const failed = (env: EnvFiles) =>
	configChecks(env)
		.filter((check) => check.status === 'fail')
		.map((check) => check.text);

describe('ops:check configuration', () => {
	it('passes a complete production configuration', async () => {
		const checks = configChecks(await valid());
		expect(checks.filter((check) => check.status !== 'ok')).toEqual([]);
		expect(report(checks)).toMatch(/^Bereit\. 0 Hinweis/m);
	});

	it('names what is missing or does not match', async () => {
		const env = await valid();
		env.api.STORAGE_SECRET_KEY = '';
		env.api.DATABASE_URL = 'postgres://clinks:owner@db.intern:5432/clinks';
		env.api.WEB_ORIGIN = 'http://app.clinks.ch';
		env.collab.JWKS_URL = 'https://api.clinks.ch/jwks';
		env.powersync.PS_DATA_SOURCE_URI = env.api.DATABASE_URL;
		expect(failed(env)).toEqual([
			'API würde nicht starten',
			'STORAGE_SECRET_KEY hat 32 Byte',
			'WEB_ORIGIN verwendet HTTPS',
			'API verbindet sich als clinks_api, nicht als Eigentümer',
			'JWKS_URL zeigt auf die öffentliche API',
			'Eigenes Replikations-Login',
		]);
		expect(report(configChecks(env))).toMatch(/6 Punkt\(e\) müssen behoben werden/);
	});

	it('warns about the Stripe test mode and treats empty lines as unset', async () => {
		const env = await valid();
		env.api.STRIPE_SECRET_KEY = 'sk_test_x';
		env.api.STRIPE_TAX = '';
		const checks = configChecks(env);
		expect(checks.find((check) => check.text.startsWith('Testmodus'))?.status).toBe('warn');
		expect(failed(env)).toEqual([]);
	});
});
