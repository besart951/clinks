export class QueryState<T> {
	data = $state<T | null>(null);
	loading = $state(false);
	error = $state('');
	loaded = $derived(this.data !== null);

	async execute(fn: () => Promise<T>) {
		this.loading = true;
		this.error = '';
		try {
			this.data = await fn();
			return this.data;
		} catch (e) {
			this.error = String(e);
			return null;
		} finally {
			this.loading = false;
		}
	}

	reset() {
		this.data = null;
		this.error = '';
	}
}
