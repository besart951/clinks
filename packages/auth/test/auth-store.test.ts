import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APIError } from '@clinks/api-client/errors';

const state = (value: unknown) => value;
state.raw = state;
(globalThis as any).$state ??= state;

import { AuthStore } from '../src/auth-store.svelte.ts';

const session = {
	user: { id: 'user-1', email: 'user@clinks.test', locale: 'de-CH', globalRole: 'user' as const },
	activeTenant: { id: 'tenant-1', name: 'One', revision: 1n },
	memberships: [],
};

describe('AuthStore', () => {
	it('deduplicates initial session hydration', async () => {
		let calls = 0;
		const hydration = deferred<typeof session>();
		const service = sessionService({
			async getSession() {
				calls += 1;
				return hydration.promise;
			},
		});
		const auth = new AuthStore(service, async () => undefined);
		const first = auth.initialize();
		const second = auth.initialize();
		assert.equal(first, second);
		hydration.resolve(session);
		await Promise.all([first, second]);
		assert.equal(calls, 1);
		assert.equal(auth.status, 'authenticated');
	});

	it('distinguishes an anonymous session from an infrastructure error', async () => {
		const unauthenticated = new AuthStore(
			sessionService({
				async getSession() {
					throw new APIError({ code: 'unauthenticated', message: 'no session', locale: 'de-CH' }, 16);
				},
			}),
			async () => undefined,
		);
		await unauthenticated.initialize();
		assert.equal(unauthenticated.status, 'anonymous');

		const unavailable = new AuthStore(
			sessionService({
				async getSession() {
					throw new Error('offline');
				},
			}),
			async () => undefined,
		);
		await unavailable.initialize();
		assert.equal(unavailable.status, 'error');
	});

	it('updates and clears the session through explicit actions', async () => {
		const auth = new AuthStore(sessionService(), async () => undefined);
		await auth.login({ email: 'user@clinks.test', password: 'secret' });
		assert.equal(auth.current, session);
		await auth.logout();
		assert.equal(auth.status, 'anonymous');
	});

	it('moves failed auth actions into the error state without clearing the current session', async () => {
		const failure = new Error('offline');
		const auth = new AuthStore(
			sessionService({
				async login() {
					throw failure;
				},
			}),
			async () => undefined,
		);

		await assert.rejects(auth.login({ email: 'user@clinks.test', password: 'secret' }), failure);
		assert.equal(auth.status, 'anonymous');
		assert.equal(auth.error, failure);
	});

	it('retains the current session when logout fails for an infrastructure reason', async () => {
		const failure = new Error('offline');
		const auth = new AuthStore(
			sessionService({
				async logout() {
					throw failure;
				},
			}),
			async () => undefined,
		);
		await auth.login({ email: 'user@clinks.test', password: 'secret' });

		await assert.rejects(auth.logout(), failure);
		assert.equal(auth.current, session);
		assert.equal(auth.status, 'authenticated');
		assert.equal(auth.error, failure);
	});

	it('clears an existing session only for an unauthenticated response', async () => {
		const unauthenticated = new APIError({ code: 'unauthenticated', message: 'no session', locale: 'de-CH' }, 16);
		const auth = new AuthStore(
			sessionService({
				async getSession() {
					throw unauthenticated;
				},
			}),
			async () => undefined,
		);
		await auth.login({ email: 'user@clinks.test', password: 'secret' });

		await auth.refresh();
		assert.equal(auth.current, null);
		assert.equal(auth.status, 'anonymous');
		assert.equal(auth.error, null);
	});

	it('does not let an older hydration overwrite a newer login', async () => {
		const hydration = deferred<typeof session>();
		const newerSession = { ...session, activeTenant: { id: 'tenant-2', name: 'Two', revision: 2n } };
		const auth = new AuthStore(
			sessionService({
				getSession: () => hydration.promise,
				login: async () => newerSession,
			}),
			async () => undefined,
		);

		const initializing = auth.initialize();
		await auth.login({ email: 'user@clinks.test', password: 'secret' });
		hydration.resolve(session);
		await initializing;

		assert.equal(auth.current, newerSession);
		assert.equal(auth.status, 'authenticated');
	});

	it('revalidates only after the bounded session freshness window', async () => {
		let calls = 0;
		const auth = new AuthStore(
			sessionService({
				async getSession() {
					calls += 1;
					return session;
				},
			}),
			async () => undefined,
		);
		await auth.initialize();
		await auth.revalidateIfStale(Date.now());
		assert.equal(calls, 1);
		await auth.revalidateIfStale(Date.now() + 5 * 60 * 1000 + 1);
		assert.equal(calls, 2);
	});

	it('keeps an authenticated screen available when background revalidation is offline', async () => {
		let offline = false;
		const auth = new AuthStore(
			sessionService({
				async getSession() {
					if (offline) throw new Error('offline');
					return session;
				},
			}),
			async () => undefined,
		);
		await auth.initialize();
		offline = true;

		await auth.revalidateIfStale(Date.now() + 5 * 60 * 1000 + 1);

		assert.equal(auth.status, 'authenticated');
		assert.equal(auth.current, session);
		assert.equal((auth.error as Error).message, 'offline');
	});

	it('discovers Google capability and redirects only to a safe internal return target', async () => {
		const redirects: string[] = [];
		const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
		Object.defineProperty(globalThis, 'location', {
			configurable: true,
			value: { origin: 'https://planer.clinks.test' },
		});
		try {
			const auth = new AuthStore(
				sessionService({
					async authCapabilities() {
						return { googleOIDCEnabled: true };
					},
					googleOIDCStartURL(_mode: string, returnTo: string) {
						return `https://api.clinks.test/start?return_to=${encodeURIComponent(returnTo)}`;
					},
				}),
				async () => undefined,
				(target) => redirects.push(target),
			);
			await auth.initialize();
			auth.startGoogle({ mode: 'login', returnTo: '/login?completed=1' });
			auth.startGoogle({ mode: 'login', returnTo: 'https://evil.test' });

			assert.equal(redirects.length, 1);
			assert.match(redirects[0], /planer\.clinks\.test/);
		} finally {
			if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
			else delete (globalThis as any).location;
		}
	});

	it('recovers capability discovery on an explicit refresh', async () => {
		let calls = 0;
		const auth = new AuthStore(
			sessionService({
				async authCapabilities() {
					calls += 1;
					if (calls === 1) throw new Error('offline');
					return { googleOIDCEnabled: true };
				},
			}),
			async () => undefined,
		);

		await auth.initialize();
		assert.equal(auth.capabilities.googleOIDCEnabled, false);
		await auth.refresh();
		assert.equal(auth.capabilities.googleOIDCEnabled, true);
		assert.equal(calls, 2);
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function sessionService(overrides: Record<string, unknown> = {}) {
	return {
		authCapabilities: async () => ({ googleOIDCEnabled: false }),
		googleOIDCStartURL: () => 'https://api.clinks.test/auth/oidc/google/start',
		getSession: async () => session,
		login: async () => session,
		adminLogin: async () => session,
		register: async () => session,
		acceptInvitation: async () => session,
		switchTenant: async () => session,
		logout: async () => undefined,
		...overrides,
	} as any;
}
