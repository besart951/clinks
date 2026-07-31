import type { TenantService } from '@clinks/api-client';
import type { Tenant } from '@clinks/api-client';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte.ts';
import { QueryState } from './query-state.svelte.ts';

export class TenantViewModel {
	tenants = new QueryState<Tenant[]>();
	tenantName = $state('');
	error = $state('');
	busy = $state(false);

	#service: TenantService;
	#messages: ErrorMessageFormatter;

	constructor(service: TenantService, messages: ErrorMessageFormatter) {
		this.#service = service;
		this.#messages = messages;
	}

	async load() {
		await this.tenants.execute(() => this.#service.tenants());
	}

	async createTenant() {
		if (this.busy) return;
		const name = this.tenantName.trim();
		if (!name) return;
		this.busy = true;
		this.error = '';
		this.tenantName = '';
		const snapshot = this.tenants.data;
		const optimistic: Tenant = { id: 'pending', name };
		this.tenants.data = [...(snapshot ?? []), optimistic];
		try {
			await this.#service.createTenant(name);
			await this.load();
		} catch (error) {
			this.tenants.data = snapshot;
			this.tenantName = name;
			this.error = this.#messages.message(error);
		} finally {
			this.busy = false;
		}
	}

	clear() {
		this.tenants.reset();
		this.tenantName = '';
		this.error = '';
		this.busy = false;
	}
}
