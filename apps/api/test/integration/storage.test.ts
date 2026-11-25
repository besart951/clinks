import assert from 'node:assert/strict';
import { CreateBucketCommand, PutBucketCorsCommand, PutBucketVersioningCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { startApi, type Api } from './harness.ts';

const infomaniak = {
	provider: 'infomaniak',
	endpoint: 'https://s3.pub1.infomaniak.cloud',
	region: 'dc3-a',
	bucket: 'stille-docs',
	accessKeyId: 'EC2ACCESS',
	secretAccessKey: '',
	pathStyle: true,
	acknowledgeLocation: false,
};

describe('tenant storage', () => {
	let api: Api;
	beforeAll(async () => {
		api = await startApi();
	});
	afterAll(async () => {
		await api?.stop();
	});

	it('keeps the secret encrypted and write-only, per tenant, for administrators only', async () => {
		const a = await api.administrator('storage-a@example.ch', 'Storage A');
		const b = await api.administrator('storage-b@example.ch', 'Storage B');
		const call = (method: string, path: string, body?: unknown) =>
			a.browser.call(method, path, { token: a.token, body });
		assert.equal((await call('GET', '/tenant/storage')).body, null);
		const missing = await call('POST', '/tenant/storage', infomaniak);
		assert.equal(missing.status, 400);
		assert.ok(missing.body.error.fields.secretAccessKey);
		const saved = await call('POST', '/tenant/storage', { ...infomaniak, secretAccessKey: 'top-secret-9876' });
		assert.equal(saved.status, 200, JSON.stringify(saved.body));
		assert.equal(saved.body.secretHint, '9876');
		assert.equal('secretAccessKey' in saved.body, false);
		const rows = await api.owner.selectFrom('auth.storageConfigs').selectAll().execute();
		assert.equal(rows.length, 1);
		assert.equal(rows[0].secretCiphertext.includes('top-secret'), false);
		// Same key: the secret stays; another key: it is required again.
		assert.equal((await call('POST', '/tenant/storage', { ...infomaniak, bucket: 'stille-archive' })).status, 200);
		assert.equal((await call('POST', '/tenant/storage', { ...infomaniak, accessKeyId: 'OTHER' })).status, 400);
		assert.equal((await call('GET', '/tenant/storage')).body.bucket, 'stille-archive');
		// Older rows stay for the versions stored there, but only one is active.
		const active = await api.owner.selectFrom('auth.storageConfigs').select('active').execute();
		assert.deepEqual(active.map((row) => row.active).sort(), [false, true]);
		assert.equal((await b.browser.call('GET', '/tenant/storage', { token: b.token })).body, null);
		const exported = JSON.stringify((await call('GET', '/me')).body);
		assert.equal(exported.includes('top-secret'), false);
	});

	it('asks for consent before health data leaves Switzerland and can go back to CLinks storage', async () => {
		const a = await api.administrator('storage-c@example.ch', 'Storage C');
		const call = (method: string, path: string, body?: unknown) =>
			a.browser.call(method, path, { token: a.token, body });
		const r2 = {
			...infomaniak,
			provider: 'cloudflare',
			endpoint: 'https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com',
			region: 'auto',
			secretAccessKey: 'r2-secret',
		};
		const refused = await call('POST', '/tenant/storage', r2);
		assert.equal(refused.status, 400);
		assert.ok(refused.body.error.fields.acknowledgeLocation);
		assert.ok(
			(await call('POST', '/tenant/storage', { ...r2, acknowledgeLocation: true })).body.locationAcknowledgedAt,
		);
		assert.equal((await call('POST', '/tenant/storage', { ...infomaniak, provider: 'clinks' })).body, null);
		assert.equal((await call('GET', '/tenant/storage')).body, null);
	});

	it('refuses endpoints inside the network (SSRF)', async () => {
		const a = await api.administrator('storage-d@example.ch', 'Storage D');
		const call = (body: unknown) => a.browser.call('POST', '/tenant/storage', { token: a.token, body });
		for (const endpoint of [
			'https://10.0.0.5',
			'https://127.0.0.1:9000',
			'https://[::1]',
			'https://internal.example.com',
			'http://s3.example.com',
		])
			assert.equal((await call({ ...infomaniak, endpoint, secretAccessKey: 'x' })).status, 400, endpoint);
	});

	it('reports unreachable instead of secret when an already stored endpoint resolves internal on test', async () => {
		const a = await api.administrator('storage-rebinding@example.ch', 'Storage Rebind');
		const call = (method: string, path: string, body?: unknown) =>
			a.browser.call(method, path, { token: a.token, body });
		const saved = await call('POST', '/tenant/storage', { ...infomaniak, secretAccessKey: 'top-secret-1234' });
		assert.equal(saved.status, 200);
		await api.owner
			.updateTable('auth.storageConfigs')
			.set({ endpoint: 'https://internal.example.com' })
			.where('id', '=', saved.body.id)
			.execute();
		const checked = await call('POST', '/tenant/storage/test');
		assert.equal(checked.status, 200);
		assert.equal(checked.body.ok, false);
		assert.deepEqual(checked.body.problems, ['unreachable']);
	});
});

/** Against the local RustFS (`pnpm dev:services`); set S3_TEST_ENDPOINT=http://localhost:9000 to run it. */
describe.runIf(process.env.S3_TEST_ENDPOINT)('tenant storage on a real bucket', () => {
	let api: Api;
	const endpoint = process.env.S3_TEST_ENDPOINT!;
	const credentials = {
		accessKeyId: process.env.S3_TEST_ACCESS_KEY ?? 'clinks',
		secretAccessKey: process.env.S3_TEST_SECRET_KEY ?? 'clinks-dev-secret',
	};
	const bucket = `tenant-${Date.now()}`;
	beforeAll(async () => {
		api = await startApi(undefined, { allowInternalStorage: true });
		const s3 = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials });
		await s3.send(new CreateBucketCommand({ Bucket: bucket }));
	});
	afterAll(async () => {
		await api?.stop();
	});

	it('reports what a bucket lacks, then passes once it is set up', async () => {
		const a = await api.administrator('storage-s3@example.ch', 'Storage S3');
		const call = (method: string, path: string, body?: unknown) =>
			a.browser.call(method, path, { token: a.token, body });
		const settings = {
			provider: 'custom',
			endpoint,
			region: 'us-east-1',
			bucket,
			accessKeyId: credentials.accessKeyId,
			secretAccessKey: credentials.secretAccessKey,
			pathStyle: true,
			acknowledgeLocation: true,
		};
		assert.equal((await call('POST', '/tenant/storage', settings)).status, 200);
		const first = (await call('POST', '/tenant/storage/test')).body;
		assert.equal(first.ok, false);
		assert.ok(first.problems.includes('versioning'));
		const s3 = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials });
		await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }));
		await s3.send(
			new PutBucketCorsCommand({
				Bucket: bucket,
				CORSConfiguration: { CORSRules: [{ AllowedOrigins: ['http://web.test'], AllowedMethods: ['GET', 'PUT'] }] },
			}),
		);
		const second = (await call('POST', '/tenant/storage/test')).body;
		assert.deepEqual(second.problems, []);
		assert.equal(second.ok, true);
		assert.equal((await call('GET', '/tenant/storage')).body.lastCheck.ok, true);
		const wrong = await call('POST', '/tenant/storage', {
			...settings,
			accessKeyId: 'nobody',
			secretAccessKey: 'wrong',
		});
		assert.equal(wrong.status, 200);
		assert.deepEqual((await call('POST', '/tenant/storage/test')).body.problems, ['credentials']);
	});
});
