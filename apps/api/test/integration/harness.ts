import type { Billing } from '../../src/services/billing.ts';
import { createDb, type Db } from '@clinks/db/client';
import { createTestDatabase, type TestDatabase } from '@clinks/db/testing';
import { generateHOTP } from '@oslojs/otp';
import { decodeBase32IgnorePadding } from '@oslojs/encoding';
import { createApp } from '../../src/app.ts';
import { MemoryMailer } from '../../src/mailer.ts';
import { RateLimiter } from '../../src/rate-limit.ts';
import { TokenService } from '../../src/tokens.ts';
import { SecretBox } from '../../src/crypto.ts';

export const password = 'correct-horse-battery';

/** The API on a fresh database, with mails kept in memory and a clock tests can move. */
export async function startApi(billing?: Billing, options: { allowInternalStorage?: boolean } = {}) {
	const database: TestDatabase = await createTestDatabase();
	const db: Db = createDb(database.appUrl, { max: 4 });
	const owner: Db = createDb(database.ownerUrl, { max: 2 });
	const tokens = await TokenService.create({ issuer: 'http://test', audience: 'clinks' });
	const mailer = new MemoryMailer();
	const clock = { offset: 0 };
	const services = {
		billing,
		db,
		tokens,
		mailer,
		limiter: new RateLimiter(),
		secrets: SecretBox.ephemeral(),
		// Fixed DNS: provider hosts resolve to a public address, one name points inside.
		resolveHost: async (host: string) => (host === 'internal.example.com' ? ['10.1.2.3'] : ['185.10.20.30']),
		config: { WEB_ORIGIN: 'http://web.test', STORAGE_ALLOW_INTERNAL: options.allowInternalStorage ?? false },
		now: () => new Date(Date.now() + clock.offset),
	};
	const app = createApp({
		services,
		config: { WEB_ORIGIN: 'http://web.test', COOKIE_SECURE: true, TRUST_PROXY: true },
	});
	let nextIp = 1;

	/** A browser: keeps the refresh cookie between calls and has its own address. */
	function client() {
		const ip = `10.0.0.${nextIp++}`;
		let cookie: string | null = null;
		return {
			get cookie() {
				return cookie;
			},
			set cookie(value: string | null) {
				cookie = value;
			},
			async call(
				method: string,
				path: string,
				options: { body?: unknown; token?: string | null; headers?: Record<string, string> } = {},
			) {
				const headers: Record<string, string> = {
					'X-Forwarded-For': ip,
					'X-Clinks-Client': 'web',
					'User-Agent': 'vitest',
					...options.headers,
				};
				if (options.body !== undefined) headers['Content-Type'] = 'application/json';
				if (options.token) headers.Authorization = `Bearer ${options.token}`;
				if (cookie) headers.Cookie = cookie;
				const response = await app.request(path, {
					method,
					headers,
					body: options.body === undefined ? undefined : JSON.stringify(options.body),
				});
				const setCookie = response.headers.get('set-cookie');
				if (setCookie) cookie = setCookie.includes('Max-Age=0') ? null : setCookie.split(';')[0];
				const text = await response.text();
				return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
			},
		};
	}

	/** Signs up and verifies an address; returns the browser and its access token. */
	async function signedUp(email: string) {
		const browser = client();
		const signUp = await browser.call('POST', '/auth/sign-up', {
			body: { firstName: 'Test', lastName: 'Person', email, password },
		});
		if (signUp.status !== 201) throw new Error(JSON.stringify(signUp.body));
		const verified = await browser.call('POST', '/auth/verify-email', {
			body: { verificationId: signUp.body.verificationId, code: codeIn(email) },
		});
		if (verified.status !== 200) throw new Error(JSON.stringify(verified.body));
		return { browser, token: verified.body.accessToken as string };
	}

	/** Signs up, creates a tenant and switches into it as its administrator. */
	async function administrator(email: string, tenantName: string) {
		const { browser, token } = await signedUp(email);
		const created = await browser.call('POST', '/tenants', {
			token,
			body: { name: tenantName, industry: 'physio', modules: ['finance', 'planner', 'mail', 'physio', 'spitex'] },
		});
		const switched = await browser.call('POST', '/me/tenant', { token, body: { tenantId: created.body.tenantId } });
		return { browser, token: switched.body.accessToken as string, tenantId: created.body.tenantId as string };
	}

	function codeIn(email: string): string {
		return /\b([0-9]{6})\b/.exec(mailer.last(email).text)![1];
	}

	function linkTokenIn(email: string): string {
		return decodeURIComponent(/(?:token=|invitation\/)([A-Za-z0-9_%-]+)/.exec(mailer.last(email).text)![1]);
	}

	return {
		app,
		db,
		owner,
		tokens,
		mailer,
		clock,
		client,
		signedUp,
		administrator,
		codeIn,
		linkTokenIn,
		totp: (secret: string) =>
			generateHOTP(decodeBase32IgnorePadding(secret), BigInt(Math.floor((Date.now() + clock.offset) / 30_000)), 6),
		async stop() {
			await db.destroy();
			await owner.destroy();
			await database.drop();
		},
	};
}

export type Api = Awaited<ReturnType<typeof startApi>>;
