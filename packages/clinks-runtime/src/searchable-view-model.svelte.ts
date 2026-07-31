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

	constructor(fetchPage: (params: FetchPageParams<F>) => Promise<Page<T>>, defaultFilters: F, debounceMs = 300) {
		this.#fetchPage = fetchPage;
		this.filters = { ...defaultFilters };
		this.#debounceMs = debounceMs;
	}

	async #load(reset: boolean) {
		this.loading = true;
		this.error = '';
		try {
			const page = await this.#fetchPage({
				search: this.search,
				filters: this.filters,
				cursor: reset ? '' : this.nextCursor,
			});
			this.items = reset ? page.items : [...this.items, ...page.items];
			this.nextCursor = page.nextCursor;
		} catch (err) {
			this.error = String(err);
		} finally {
			this.loading = false;
		}
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
}
