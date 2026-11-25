import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import type { AbstractPowerSyncDatabase } from '@powersync/web';
import type { TenantId } from '@clinks/domain/ids';
import { ApiClient } from '../src/lib/data/api-client.ts';
import { MockApiError, WorkspaceCache, emptySnapshot } from '../src/lib/data/database.ts';
import { requestSignOut } from '../src/lib/features/shell/sign-out.ts';
import { RemoteAuthGateway } from '../src/lib/session/remote-auth.ts';
import { ApiConnector } from '../src/lib/sync/connector.ts';
import type { SyncEngine } from '../src/lib/sync/sync-engine.svelte.ts';

function oneTxDatabase() {
	let completeCalls = 0;
	let returned = false;
	const database = {
		async getNextCrudTransaction() {
			if (returned) return null;
			returned = true;
			return {
				crud: [{ op: 'PUT', table: 'contacts', id: 'id-1', opData: { first_name: 'Lea' } }],
				async complete() {
					completeCalls += 1;
				},
			};
		},
	} as unknown as AbstractPowerSyncDatabase;
	return { database, completed: () => completeCalls };
}

async function uploadWithError(error: unknown) {
	const rejected: string[] = [];
	const client = {
		request: vi.fn().mockRejectedValue(error),
	} as unknown as ApiClient;
	const { database, completed } = oneTxDatabase();

	const connector = new ApiConnector(client, 'http://sync.invalid', (message) => rejected.push(message));
	let thrown: unknown = null;
	try {
		await connector.uploadData(database);
	} catch (caught) {
		thrown = caught;
	}
	return { thrown, completeCalls: completed(), rejected };
}

describe('ApiConnector', () => {
	it('uploads ops and completes the transaction on success', async () => {
		const calls: unknown[] = [];
		const client = {
			request: vi.fn(async (...args: unknown[]) => {
				calls.push(args);
				return { applied: 1 };
			}),
		} as unknown as ApiClient;
		const { database, completed } = oneTxDatabase();

		const connector = new ApiConnector(client, 'http://sync.invalid', () => {});
		await connector.uploadData(database);
		assert.equal(completed(), 1);
		assert.deepEqual(calls, [
			['POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: 'id-1', data: { first_name: 'Lea' } }] }],
		]);
	});

	for (const code of ['validation', 'forbidden', 'conflict', 'not_found'] as const) {
		it(`drops permanent ${code} error with notification`, async () => {
			const { thrown, completeCalls, rejected } = await uploadWithError(new MockApiError(code, `err:${code}`));
			assert.equal(thrown, null);
			assert.equal(completeCalls, 1);
			assert.deepEqual(rejected, [`err:${code}`]);
		});
	}

	for (const code of ['unauthorized', 'rate_limited', 'locked', 'offline', 'internal'] as const) {
		it(`keeps local transaction queued on transient/auth ${code} error`, async () => {
			const error = new MockApiError(code, `err:${code}`);
			const { thrown, completeCalls, rejected } = await uploadWithError(error);
			assert.equal(thrown, error);
			assert.equal(completeCalls, 0);
			assert.deepEqual(rejected, []);
		});
	}

	it('rethrows unexpected runtime errors without completing transaction', async () => {
		const error = new Error('boom');
		const { thrown, completeCalls, rejected } = await uploadWithError(error);
		assert.equal(thrown, error);
		assert.equal(completeCalls, 0);
		assert.deepEqual(rejected, []);
	});
});

describe('ApiClient error mapping', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	for (const [status, expectedCode] of [
		[401, 'unauthorized'],
		[403, 'forbidden'],
		[423, 'locked'],
		[429, 'rate_limited'],
	] as const) {
		it(`maps HTTP ${status} to ${expectedCode}`, async () => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response(JSON.stringify({ error: { code: 'e', message: 'msg' } }), {
						status,
						headers: { 'Content-Type': 'application/json' },
					}),
				),
			);
			const client = new ApiClient(
				'http://api.invalid',
				() => 'de-CH',
				(key) => key,
			);
			await assert.rejects(
				client.request('GET', '/me'),
				(error: MockApiError) => error.code === expectedCode && error.message === 'msg',
			);
		});
	}

	it('handles non-standard JSON error payloads without throwing TypeError', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ message: 'Bad Gateway' }), {
					status: 502,
					statusText: 'Bad Gateway',
					headers: { 'Content-Type': 'application/json' },
				}),
			),
		);
		const client = new ApiClient(
			'http://api.invalid',
			() => 'de-CH',
			(key) => key,
		);
		await assert.rejects(
			client.request('GET', '/me'),
			(error: MockApiError) => error.code === 'internal' && error.message === 'Bad Gateway',
		);
	});
});

describe('requestSignOut', () => {
	it('signs out immediately when no local writes are pending', async () => {
		const steps: string[] = [];
		const confirm = await requestSignOut(
			{
				t: (key) => key,
				sync: { pendingCount: async () => 0 },
				session: { signOut: async () => void steps.push('signOut') },
			},
			async () => void steps.push('navigate'),
		);
		assert.equal(confirm, null);
		assert.deepEqual(steps, ['signOut', 'navigate']);
	});

	it('returns a destructive confirmation request when pending writes exist', async () => {
		const steps: string[] = [];
		const confirm = await requestSignOut(
			{
				t: (key, params) => `${key}:${params?.count ?? ''}`,
				sync: { pendingCount: async () => 3 },
				session: { signOut: async () => void steps.push('signOut') },
			},
			async () => void steps.push('navigate'),
		);
		assert.ok(confirm);
		assert.equal(confirm.destructive, true);
		assert.equal(confirm.description, 'ui.ws.sync.confirm_discard:3');
		assert.deepEqual(steps, []);
		await confirm.onConfirm();
		assert.deepEqual(steps, ['signOut', 'navigate']);
	});
});

describe('RemoteAuthGateway tenant switch & creation safety', () => {
	function gatewaySetup(pending = 0) {
		const syncCalls: string[] = [];
		let pendingWrites = pending;
		const client = {
			localError: (key: string) => new MockApiError('validation', key),
			request: vi.fn(async (_method: string, path: string) => {
				if (path === '/tenants') return { tenantId: 'tenant-new' as TenantId };
				return { accessToken: 'tok', expiresAt: new Date(Date.now() + 60_000).toISOString() };
			}),
			adopt: vi.fn(),
		} as unknown as ApiClient;
		const cache = new WorkspaceCache({ storage: null, seed: emptySnapshot, localize: (k) => k });
		const sync = {
			pendingCount: async () => pendingWrites,
			clear: async () => void syncCalls.push('clear'),
			connect: async () => void syncCalls.push('connect'),
			reconnect: async () => void syncCalls.push('reconnect'),
			insert: async () => {},
			reportImportError: vi.fn(),
		} as unknown as SyncEngine;
		const prefs = {
			read: <T>(_k: string, d: T) => d,
			write: () => {},
			remove: () => {},
		};
		const gateway = new RemoteAuthGateway(client, cache, sync, () => cache, prefs);
		return {
			gateway,
			client,
			syncCalls,
			setPending: (value: number) => {
				pendingWrites = value;
			},
		};
	}

	it('clears and reconnects SQLite when switching to a different tenant with 0 pending writes', async () => {
		const { gateway, syncCalls } = gatewaySetup(0);
		await gateway.switchTenant('tenant-a' as TenantId);
		assert.deepEqual(syncCalls, ['reconnect']);
		syncCalls.length = 0;
		await gateway.switchTenant('tenant-b' as TenantId);
		assert.deepEqual(syncCalls, ['clear', 'connect']);
	});

	it('blocks switching tenants when local writes are pending', async () => {
		const { gateway, client, syncCalls, setPending } = gatewaySetup(0);
		await gateway.switchTenant('tenant-a' as TenantId);
		syncCalls.length = 0;
		setPending(2);
		await assert.rejects(
			gateway.switchTenant('tenant-b' as TenantId),
			(error: MockApiError) => error.message === 'error.ws.sync.switch_pending',
		);
		assert.equal((client.request as ReturnType<typeof vi.fn>).mock.calls.length, 1);
		assert.deepEqual(syncCalls, []);
	});

	it('blocks creating a new tenant before POST /tenants when current tenant has pending writes', async () => {
		const { gateway, client, setPending } = gatewaySetup(0);
		await gateway.switchTenant('tenant-a' as TenantId);
		setPending(1);
		await assert.rejects(
			gateway.createTenant(
				{ companyName: 'Zweite Praxis', industry: 'services', modules: ['contacts'], demoData: false, invites: [] },
				() => ({}),
			),
			(error: MockApiError) => error.message === 'error.ws.sync.switch_pending',
		);
		assert.equal((client.request as ReturnType<typeof vi.fn>).mock.calls.length, 1);
	});
});
