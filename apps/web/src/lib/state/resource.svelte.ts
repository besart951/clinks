import { MockApiError, type WorkspaceCache, type TableName } from '../data/database.ts';

export type ResourceStatus = 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Data a screen loads from the mock API. The first load shows a skeleton; later changes to the
 * watched tables reload quietly so every open view stays current.
 */
export class Resource<T> {
	status = $state<ResourceStatus>('loading');
	data = $state.raw<T | null>(null);
	error = $state('');
	#load: () => Promise<T>;
	#tables: readonly TableName[];
	#db: WorkspaceCache;
	#request = 0;

	constructor(db: WorkspaceCache, tables: readonly TableName[], load: () => Promise<T>) {
		this.#db = db;
		this.#tables = tables;
		this.#load = load;
	}

	get value(): T {
		return this.data as T;
	}

	async reload(quiet = false) {
		const request = ++this.#request;
		if (!quiet || this.data === null) this.status = 'loading';
		try {
			const data = await this.#load();
			if (request !== this.#request) return;
			this.data = data;
			this.status = 'ready';
		} catch (error) {
			if (request !== this.#request) return;
			if (quiet && this.data !== null) return;
			this.error = error instanceof Error ? error.message : String(error);
			this.status = error instanceof MockApiError && error.code === 'unauthorized' ? 'forbidden' : 'error';
		}
	}

	/** Loads now and reloads on changes; returns the cleanup for the component. */
	connect(): () => void {
		void this.reload();
		return this.#db.on((table) => {
			if (this.#tables.includes(table)) void this.reload(true);
		});
	}

	/** Shows a local change at once, before the API has confirmed it. */
	patch(update: (current: T) => T) {
		if (this.data !== null) this.data = update(this.data);
	}
}
