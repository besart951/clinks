import type { ErrorMessageFormatter } from './error-handler.ts';

export class QueryState<T> {
	data = $state<T | null>(null);
	loading = $state(false);
	error = $state('');
	loaded = $derived(this.data !== null);
	#request = 0;
	#inflight: { key: string; promise: Promise<T | null> } | null = null;
	#messages: ErrorMessageFormatter;

	constructor(messages: ErrorMessageFormatter) {
		this.#messages = messages;
	}

	execute(key: string, fn: () => Promise<T>) {
		if (this.#inflight?.key === key) return this.#inflight.promise;
		const request = ++this.#request;
		this.loading = true;
		this.error = '';
		const operation = fn()
			.then((data) => {
				if (request === this.#request) this.data = data;
				return data;
			})
			.catch((error: unknown) => {
				if (request === this.#request) this.error = this.#messages.message(error);
				return null;
			})
			.finally(() => {
				if (request !== this.#request) return;
				this.loading = false;
				this.#inflight = null;
			});
		this.#inflight = { key, promise: operation };
		return operation;
	}

	reset() {
		this.#request += 1;
		this.#inflight = null;
		this.data = null;
		this.loading = false;
		this.error = '';
	}
}
