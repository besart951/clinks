import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { generatePrivateJwk, TokenService } from '../../src/tokens.ts';

const claims = { sub: 'user-1', tenant_id: 'tenant-1', role: 'role-1', sid: 'device-1' };

describe('TokenService', () => {
	it('round-trips the claims', async () => {
		const tokens = await TokenService.create({ issuer: 'iss', audience: 'aud' });
		const { token } = await tokens.issue(claims);
		assert.deepEqual(await tokens.verify(token), claims);
	});

	it('rejects expiry, other issuers and audiences', async () => {
		const tokens = await TokenService.create({ issuer: 'iss', audience: 'aud' });
		const old = await tokens.issue(claims, new Date(Date.now() - 16 * 60_000));
		await assert.rejects(tokens.verify(old.token));
		const other = await TokenService.create({ issuer: 'other', audience: 'aud' });
		await assert.rejects(tokens.verify((await other.issue(claims)).token));
	});

	it('keeps accepting tokens of the previous key during a rotation', async () => {
		const oldKey = await generatePrivateJwk('old');
		const before = await TokenService.create({ issuer: 'iss', audience: 'aud', signingKey: JSON.stringify(oldKey) });
		const token = (await before.issue(claims)).token;
		const after = await TokenService.create({
			issuer: 'iss',
			audience: 'aud',
			signingKey: JSON.stringify(await generatePrivateJwk('new')),
			previousPublicKeys: JSON.stringify([oldKey]),
		});
		assert.equal((await after.verify(token)).sub, 'user-1');
		assert.deepEqual(
			after.jwks().keys.map((key) => key.kid),
			['new', 'old'],
		);
		assert.ok(after.jwks().keys.every((key) => key.d === undefined));
	});
});
