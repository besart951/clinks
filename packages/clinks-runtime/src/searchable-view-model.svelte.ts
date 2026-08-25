import type { ErrorMessageFormatter } from './error-handler.ts';

export interface FetchPageParams<F extends Record<string, string>> {
	search: string;
	filters: F;
	cursor: string;
}

export interface Page<T> {
	items: T[];
	nextCursor: string;
}

export class SearchableViewModel<T, F extends Record<string, string>> {
	items = $state<T[]>([]);
	nextCursor = $state('');
	search = $state('');
	filters = $state<F>({} as F);
	loading = $state(false);
	error = $state('');

	#fetchPage: (params: FetchPageParams<F>) => Promise<Page<T>>;
	#debounceMs: number;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#request = 0;
	#inflightKey = '';
	#inflight: Promise<void> | null = null;
	#messages: ErrorMessageFormatter;

	constructor(
		fetchPage: (params: FetchPageParams<F>) => Promise<Page<T>>,
		defaultFilters: F,
		messages: ErrorMessageFormatter,
		debounceMs = 300,
	) {
		this.#fetchPage = fetchPage;
		this.filters = { ...defaultFilters };
		this.#debounceMs = debounceMs;
		this.#messages = messages;
	}

	async #load(reset: boolean) {
		const cursor = reset ? '' : this.nextCursor;
		const key = JSON.stringify([this.search, this.filters, cursor]);
		if (this.#inflight && key === this.#inflightKey) return this.#inflight;
		const request = ++this.#request;
		this.#inflightKey = key;
		this.loading = true;
		this.error = '';
		const operation = this.#fetchPage({
			search: this.search,
			filters: this.filters,
			cursor,
		})
			.then((page) => {
				if (request !== this.#request) return;
				this.items = reset ? page.items : [...this.items, ...page.items];
				this.nextCursor = page.nextCursor;
			})
			.catch((error: unknown) => {
				if (request === this.#request) this.error = this.#messages.message(error);
			})
			.finally(() => {
				if (request !== this.#request) return;
				this.loading = false;
				this.#inflight = null;
				this.#inflightKey = '';
			});
		this.#inflight = operation;
		return operation;
	}

	onSearch(query: string) {
		this.search = query;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => this.#load(true), this.#debounceMs);
	}

	onFilter(key: keyof F & string, value: string) {
		this.filters = { ...this.filters, [key]: value };
		this.#load(true);
	}

	async loadMore() {
		if (this.nextCursor) await this.#load(false);
	}

	async refresh() {
		this.search = '';
		clearTimeout(this.#timer);
		this.#timer = undefined;
		await this.#load(true);
	}

	dispose() {
		clearTimeout(this.#timer);
		this.#request += 1;
		this.#inflight = null;
		this.loading = false;
	}
}
