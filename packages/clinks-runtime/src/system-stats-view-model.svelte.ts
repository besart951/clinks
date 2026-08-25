import type { SystemService } from '@clinks/api-client';
import type { SystemStats } from '@clinks/api-client';
import { QueryState } from './query-state.svelte.ts';
import type { ErrorMessageFormatter } from './error-handler.ts';

export class SystemStatsViewModel {
	stats: QueryState<SystemStats>;

	#service: SystemService;

	constructor(service: SystemService, messages: ErrorMessageFormatter) {
		this.#service = service;
		this.stats = new QueryState<SystemStats>(messages);
	}

	async load() {
		await this.stats.execute('system-stats', () => this.#service.systemStats());
	}

	clear() {
		this.stats.reset();
	}
}
