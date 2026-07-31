import type { SystemService } from '@clinks/api-client';
import type { SystemStats } from '@clinks/api-client';
import { QueryState } from './query-state.svelte.ts';

export class SystemStatsViewModel {
	stats = new QueryState<SystemStats>();

	#service: SystemService;

	constructor(service: SystemService) {
		this.#service = service;
	}

	async load() {
		await this.stats.execute(() => this.#service.systemStats());
	}

	clear() {
		this.stats.reset();
	}
}
