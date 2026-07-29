import type { ClinksClient, Tenant } from '@clinks/api-client';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte';

export class TenantViewModel {
	tenants = $state<Tenant[]>([]);
	tenantName = $state('');

	#client: Pick<ClinksClient, 'createTenant' | 'tenants'>;
	#messages: ErrorMessageFormatter;
	#onError: (message: string) => void;

	constructor(
		client: Pick<ClinksClient, 'createTenant' | 'tenants'>,
		messages: ErrorMessageFormatter,
		onError: (message: string) => void,
	) {
		this.#client = client;
		this.#messages = messages;
		this.#onError = onError;
	}

	async load() {
		this.tenants = await this.#client.tenants();
	}

	async createTenant() {
		this.#onError('');
		try {
			await this.#client.createTenant(this.tenantName);
			this.tenantName = '';
			await this.load();
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	clear() {
		this.tenants = [];
		this.tenantName = '';
	}
}
