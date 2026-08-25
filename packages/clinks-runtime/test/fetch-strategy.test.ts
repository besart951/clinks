import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const state = (value: unknown) => value;
state.raw = state;
(globalThis as any).$state ??= state;
(globalThis as any).$derived ??= (value: unknown) => value;

import { QueryState } from '../src/query-state.svelte.ts';
import { SearchableViewModel } from '../src/searchable-view-model.svelte.ts';

const messages = { message: (error: unknown) => (error instanceof Error ? error.message : 'localized error') };

describe('fetch state', () => {
	it('deduplicates an in-flight query', async () => {
		const pending = deferred<string>();
		let calls = 0;
		const query = new QueryState<string>(messages);
		const load = () => {
			calls += 1;
			return pending.promise;
		};

		const first = query.execute('same', load);
		const second = query.execute('same', load);
		pending.resolve('ready');

		assert.equal(await first, 'ready');
		assert.equal(await second, 'ready');
		assert.equal(calls, 1);
	});

	it('starts a new keyed query and ignores the older response', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const query = new QueryState<string>(messages);

		const firstLoad = query.execute('user-a', () => first.promise);
		const secondLoad = query.execute('user-b', () => second.promise);
		second.resolve('user-b');
		first.resolve('user-a');

		assert.equal(await secondLoad, 'user-b');
		assert.equal(await firstLoad, 'user-a');
		assert.equal(query.data, 'user-b');
	});

	it('ignores a stale list response after filters change', async () => {
		const requests: Array<ReturnType<typeof deferred<{ items: string[]; nextCursor: string }>>> = [];
		const list = new SearchableViewModel<string, { status: string }>(
			() => {
				const request = deferred<{ items: string[]; nextCursor: string }>();
				requests.push(request);
				return request.promise;
			},
			{ status: '' },
			messages,
		);

		list.onFilter('status', 'first');
		list.onFilter('status', 'second');
		requests[1].resolve({ items: ['new'], nextCursor: '' });
		requests[0].resolve({ items: ['stale'], nextCursor: '' });
		await Promise.all(requests.map((request) => request.promise));
		await Promise.resolve();

		assert.deepEqual(list.items, ['new']);
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}
