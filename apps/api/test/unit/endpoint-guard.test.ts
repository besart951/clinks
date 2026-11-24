import { describe, expect, it } from 'vitest';
import type { lookup } from 'node:dns';
import { Agent } from 'node:https';
import { ObjectStore } from '../../src/object-store.ts';
import { isInternalAddress, publicLookup } from '../../src/endpoint-guard.ts';

describe('isInternalAddress', () => {
	it('lets public addresses through', () => {
		for (const address of ['185.10.20.30', '8.8.8.8', '2a00:1450:4001::1'])
			expect(isInternalAddress(address)).toBe(false);
	});
	it('stops loopback, private, link-local and mapped addresses', () => {
		for (const address of [
			'127.0.0.1',
			'10.1.2.3',
			'172.16.5.4',
			'192.168.1.1',
			'169.254.169.254',
			'100.64.0.1',
			'0.0.0.0',
			'::1',
			'::',
			'fd00::1',
			'fe80::1',
			'::ffff:10.0.0.1',
			'::ffff:127.0.0.1',
			'not-an-ip',
		])
			expect(isInternalAddress(address), address).toBe(true);
	});
});

describe('publicLookup', () => {
	const fake = (...addresses: string[]) =>
		((
			_host: string,
			_options: unknown,
			callback: (error: null, entries: { address: string; family: number }[]) => void,
		) =>
			callback(
				null,
				addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
			)) as unknown as typeof lookup;
	const run = (resolve: typeof lookup, all = false) =>
		new Promise<{ error: Error | null; address: unknown }>((done) =>
			publicLookup(resolve)('bucket.example.com', { all }, (error, address) => done({ error, address })),
		);

	it('connects to public addresses', async () => {
		expect(await run(fake('185.10.20.30'))).toEqual({ error: null, address: '185.10.20.30' });
		expect((await run(fake('185.10.20.30', '2a00:1450:4001::1'), true)).address).toHaveLength(2);
	});
	it('refuses a host that now points inside the network (DNS rebinding)', async () => {
		expect((await run(fake('185.10.20.30', '10.0.0.7'))).error?.message).toMatch(/internal/);
		expect((await run(fake('169.254.169.254'))).error).toBeTruthy();
	});
});

describe('tenant buckets', () => {
	it('open their connections through the guarded lookup', async () => {
		const seen: string[] = [];
		const resolve = ((host: string, _options: unknown, callback: (error: null, entries: unknown[]) => void) => {
			seen.push(host);
			callback(null, [{ address: '127.0.0.1', family: 4 }]);
		}) as unknown as typeof lookup;
		const store = new ObjectStore({
			bucket: 'docs',
			endpoint: 'https://s3.example.com',
			region: 'us-east-1',
			credentials: { accessKeyId: 'a', secretAccessKey: 'b' },
			httpsAgent: new Agent({ lookup: publicLookup(resolve) }),
		});
		expect(await store.check('https://app.example.com')).toEqual(['unreachable']);
		expect(seen).toContain('s3.example.com');
	});
});
