import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { password, startApi, type Api } from './harness.ts';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(async () => {
	await api?.stop();
});

describe('sign-up and sign-in', () => {
	it('verifies the address by code before the first session', async () => {
		const browser = api.client();
		const signUp = await browser.call('POST', '/auth/sign-up', {
			body: { firstName: 'Anna', lastName: 'Muster', email: 'Anna@Example.ch', password },
		});
		assert.equal(signUp.status, 201);
		assert.equal(browser.cookie, null);
		const wrong = await browser.call('POST', '/auth/verify-email', {
			body: { verificationId: signUp.body.verificationId, code: '000000' },
		});
		assert.equal(wrong.status, 400);
		const verified = await browser.call('POST', '/auth/verify-email', {
			body: { verificationId: signUp.body.verificationId, code: api.codeIn('anna@example.ch') },
		});
		assert.equal(verified.status, 200);
		assert.match(browser.cookie ?? '', /^clinks_refresh=/);
		assert.equal(verified.body.refreshToken, undefined, 'browsers never see the refresh token');
		const me = await browser.call('GET', '/me', { token: verified.body.accessToken });
		assert.equal(me.body.user.email, 'anna@example.ch');
		assert.equal(me.body.user.emailVerified, true);
		assert.deepEqual(me.body.tenants, []);
	});

	it('refuses a taken address and localizes the message', async () => {
		await api.signedUp('taken@example.ch');
		const again = await api.client().call('POST', '/auth/sign-up', {
			body: { firstName: 'A', lastName: 'B', email: 'taken@example.ch', password },
			headers: { 'Accept-Language': 'en-US' },
		});
		assert.equal(again.status, 409);
		assert.equal(again.body.error.code, 'error.email_taken');
		assert.equal(again.body.error.message, 'This email address is already in use.');
	});

	it('returns field messages for invalid input', async () => {
		const result = await api
			.client()
			.call('POST', '/auth/sign-up', { body: { firstName: 'A', lastName: 'B', email: 'nope', password: 'short' } });
		assert.equal(result.status, 400);
		assert.equal(result.body.error.code, 'error.validation');
		assert.ok(result.body.error.fields.email);
		assert.ok(result.body.error.fields.password);
	});

	it('signs in, and gives the same answer for an unknown address and a wrong password', async () => {
		await api.signedUp('bruno@example.ch');
		const browser = api.client();
		const ok = await browser.call('POST', '/auth/sign-in', { body: { email: 'bruno@example.ch', password } });
		assert.equal(ok.body.status, 'authenticated');
		const unknown = await api
			.client()
			.call('POST', '/auth/sign-in', { body: { email: 'nobody@example.ch', password } });
		const wrong = await api
			.client()
			.call('POST', '/auth/sign-in', { body: { email: 'bruno@example.ch', password: 'wrong-password' } });
		assert.equal(unknown.status, 401);
		assert.deepEqual(unknown.body, wrong.body);
	});

	it('locks the account after five wrong passwords, even with the right one', async () => {
		await api.signedUp('locked@example.ch');
		for (let attempt = 0; attempt < 5; attempt++)
			await api
				.client()
				.call('POST', '/auth/sign-in', { body: { email: 'locked@example.ch', password: 'wrong-password' } });
		const right = await api.client().call('POST', '/auth/sign-in', { body: { email: 'locked@example.ch', password } });
		assert.equal(right.status, 423);
		assert.equal(right.body.error.code, 'error.account_locked');
	});

	it('limits attempts per address', async () => {
		let last = 0;
		for (let attempt = 0; attempt < 11; attempt++)
			last = (await api.client().call('POST', '/auth/sign-in', { body: { email: 'spray@example.ch', password: 'x' } }))
				.status;
		assert.equal(last, 429);
	});

	it('asks an unverified account for a new code instead of signing it in', async () => {
		const browser = api.client();
		await browser.call('POST', '/auth/sign-up', {
			body: { firstName: 'C', lastName: 'D', email: 'later@example.ch', password },
		});
		const signIn = await browser.call('POST', '/auth/sign-in', { body: { email: 'later@example.ch', password } });
		assert.equal(signIn.body.status, 'verify_email');
		const verified = await browser.call('POST', '/auth/verify-email', {
			body: { verificationId: signIn.body.verificationId, code: api.codeIn('later@example.ch') },
		});
		assert.equal(verified.status, 200);
	});
});

describe('tokens', () => {
	it('rotates the refresh token and revokes the device when an old one comes back', async () => {
		const { browser } = await api.signedUp('rotate@example.ch');
		const stolen = browser.cookie;
		const first = await browser.call('POST', '/auth/refresh', { body: {} });
		assert.equal(first.status, 200);
		assert.notEqual(browser.cookie, stolen);
		const current = browser.cookie;

		const thief = api.client();
		thief.cookie = stolen;
		api.clock.offset += 60_000;
		assert.equal((await thief.call('POST', '/auth/refresh', { body: {} })).status, 401);
		browser.cookie = current;
		assert.equal(
			(await browser.call('POST', '/auth/refresh', { body: {} })).status,
			401,
			'the whole family is revoked',
		);
		assert.equal(
			(await browser.call('GET', '/me', { token: first.body.accessToken })).status,
			401,
			'and its access tokens too',
		);
	});

	it('refuses a refresh without the client header (no cross-site forms)', async () => {
		const { browser } = await api.signedUp('csrf@example.ch');
		const result = await browser.call('POST', '/auth/refresh', { body: {}, headers: { 'X-Clinks-Client': '' } });
		assert.equal(result.status, 401);
	});

	it('rejects tampered, expired, foreign and revoked access tokens', async () => {
		const { browser, token } = await api.signedUp('tokens@example.ch');
		const [header, payload, signature] = token.split('.');
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
		const forged = [
			header,
			Buffer.from(JSON.stringify({ ...claims, sub: crypto.randomUUID() })).toString('base64url'),
			signature,
		].join('.');
		assert.equal((await browser.call('GET', '/me', { token: forged })).status, 401);

		const expired = await api.tokens.issue(
			{ sub: claims.sub, sid: claims.sid, tenant_id: null, role: null },
			new Date(Date.now() + api.clock.offset - 20 * 60_000),
		);
		assert.equal((await browser.call('GET', '/me', { token: expired.token })).status, 401);

		const { TokenService } = await import('../../src/tokens.ts');
		const other = await TokenService.create({ issuer: 'http://test', audience: 'clinks' });
		const foreign = await other.issue({ sub: claims.sub, sid: claims.sid, tenant_id: null, role: null });
		assert.equal((await browser.call('GET', '/me', { token: foreign.token })).status, 401);

		assert.equal((await browser.call('GET', '/me', { token })).status, 200);
		await browser.call('POST', '/auth/sign-out', { token, body: {} });
		assert.equal((await browser.call('GET', '/me', { token })).status, 401, 'signed-out device');
		assert.equal(browser.cookie, null);
	});

	it('signs a device out by its cookie when the access token has expired', async () => {
		const { browser } = await api.signedUp('expired-out@example.ch');
		const cookie = browser.cookie;
		await browser.call('POST', '/auth/sign-out', { body: {} });
		const replay = api.client();
		replay.cookie = cookie;
		assert.equal((await replay.call('POST', '/auth/refresh', { body: {} })).status, 401);
	});

	it('publishes the public key as JWKS', async () => {
		const jwks = await api.client().call('GET', '/.well-known/jwks.json');
		assert.equal(jwks.body.keys.length, 1);
		assert.equal(jwks.body.keys[0].crv, 'Ed25519');
		assert.equal(jwks.body.keys[0].d, undefined, 'never the private part');
	});

	it('lists and revokes devices', async () => {
		const { token } = await api.signedUp('devices@example.ch');
		const laptop = api.client();
		await laptop.call('POST', '/auth/sign-in', { body: { email: 'devices@example.ch', password } });
		const sessions = await api.client().call('GET', '/me/sessions', { token });
		assert.equal(sessions.body.length, 2);
		const other = sessions.body.find((session: { current: boolean }) => !session.current);
		await api.client().call('DELETE', `/me/sessions/${other.id}`, { token });
		assert.equal((await laptop.call('POST', '/auth/refresh', { body: {} })).status, 401);
	});
});

describe('two-factor sign-in', () => {
	it('needs a TOTP code or a recovery code, each recovery code once', async () => {
		const { token } = await api.signedUp('totp@example.ch');
		const setup = await api.client().call('POST', '/me/two-factor/setup', { token });
		assert.match(setup.body.otpauthUri, /^otpauth:\/\/totp\//);
		const enabled = await api
			.client()
			.call('POST', '/me/two-factor/enable', { token, body: { code: api.totp(setup.body.secret) } });
		assert.equal(enabled.body.recoveryCodes.length, 10);

		const browser = api.client();
		const signIn = await browser.call('POST', '/auth/sign-in', { body: { email: 'totp@example.ch', password } });
		assert.equal(signIn.body.status, 'two_factor');
		assert.equal(browser.cookie, null, 'no session before the second factor');
		const wrong = await browser.call('POST', '/auth/two-factor', {
			body: { challengeId: signIn.body.challengeId, code: '123456' },
		});
		assert.equal(wrong.status, 400);
		const ok = await browser.call('POST', '/auth/two-factor', {
			body: { challengeId: signIn.body.challengeId, code: api.totp(setup.body.secret) },
		});
		assert.equal(ok.status, 200);
		const replay = await browser.call('POST', '/auth/two-factor', {
			body: { challengeId: signIn.body.challengeId, code: api.totp(setup.body.secret) },
		});
		assert.equal(replay.status, 400, 'a challenge works once');

		const recovery = enabled.body.recoveryCodes[0];
		const second = await api.client().call('POST', '/auth/sign-in', { body: { email: 'totp@example.ch', password } });
		assert.equal(
			(
				await api
					.client()
					.call('POST', '/auth/two-factor', { body: { challengeId: second.body.challengeId, code: recovery } })
			).status,
			200,
		);
		const third = await api.client().call('POST', '/auth/sign-in', { body: { email: 'totp@example.ch', password } });
		assert.equal(
			(
				await api
					.client()
					.call('POST', '/auth/two-factor', { body: { challengeId: third.body.challengeId, code: recovery } })
			).status,
			400,
		);
	});
});

describe('password reset', () => {
	it('sets a new password by link and signs every device out', async () => {
		const { browser } = await api.signedUp('reset@example.ch');
		const unknown = await api
			.client()
			.call('POST', '/auth/password-reset/request', { body: { email: 'ghost@example.ch' } });
		assert.equal(unknown.status, 204, 'same answer for unknown addresses');
		await api.client().call('POST', '/auth/password-reset/request', { body: { email: 'reset@example.ch' } });
		const token = api.linkTokenIn('reset@example.ch');
		const reset = await api
			.client()
			.call('POST', '/auth/password-reset', { body: { token, password: 'a-brand-new-password' } });
		assert.equal(reset.status, 204);
		assert.equal(
			(await api.client().call('POST', '/auth/password-reset', { body: { token, password: 'again-a-new-password' } }))
				.status,
			400,
			'single use',
		);
		assert.equal((await browser.call('POST', '/auth/refresh', { body: {} })).status, 401);
		const signIn = await api
			.client()
			.call('POST', '/auth/sign-in', { body: { email: 'reset@example.ch', password: 'a-brand-new-password' } });
		assert.equal(signIn.body.status, 'authenticated');
	});

	it('refuses an expired link', async () => {
		await api.signedUp('late@example.ch');
		await api.client().call('POST', '/auth/password-reset/request', { body: { email: 'late@example.ch' } });
		const token = api.linkTokenIn('late@example.ch');
		api.clock.offset += 61 * 60_000;
		const reset = await api
			.client()
			.call('POST', '/auth/password-reset', { body: { token, password: 'a-brand-new-password' } });
		assert.equal(reset.status, 400);
		assert.equal(reset.body.error.code, 'error.reset_link_invalid');
	});
});
