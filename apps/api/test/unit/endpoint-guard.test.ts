import { describe, expect, it } from 'vitest';
import { isInternalAddress } from '../../src/endpoint-guard.ts';

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
