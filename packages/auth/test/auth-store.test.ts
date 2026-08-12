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
		const service = sessionService({
			async getSession() {
				calls += 1;
				return session;
			},
		});
		const auth = new AuthStore(service, async () => undefined);
		await Promise.all([auth.initialize(), auth.initialize()]);
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
		assert.equal(auth.status, 'error');
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
		assert.equal(auth.status, 'error');
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
