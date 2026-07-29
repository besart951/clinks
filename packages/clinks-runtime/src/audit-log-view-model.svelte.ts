import type { AuditEvent, ClinksClient } from '@clinks/api-client';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte';

export class AuditLogViewModel {
	auditEvents = $state<AuditEvent[]>([]);
	nextAuditCursor = $state('');
	auditActor = $state('');
	auditTenant = $state('');
	auditAction = $state('');
	auditFrom = $state('');
	auditTo = $state('');

	#client: Pick<ClinksClient, 'auditEvents'>;
	#messages: ErrorMessageFormatter;
	#onError: (message: string) => void;

	constructor(
		client: Pick<ClinksClient, 'auditEvents'>,
		messages: ErrorMessageFormatter,
		onError: (message: string) => void,
	) {
		this.#client = client;
		this.#messages = messages;
		this.#onError = onError;
	}

	async load(cursor = '') {
		const page = await this.#client.auditEvents({
			from: toISOString(this.auditFrom),
			to: toISOString(this.auditTo),
			actorId: this.auditActor || undefined,
			tenantId: this.auditTenant || undefined,
			action: this.auditAction || undefined,
			cursor: cursor || undefined,
			pageSize: 50,
		});
		this.auditEvents = cursor ? [...this.auditEvents, ...page.events] : page.events;
		this.nextAuditCursor = page.nextCursor;
	}

	async filterAuditEvents() {
		this.#onError('');
		try {
			await this.load();
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	async loadMoreAuditEvents() {
		try {
			await this.load(this.nextAuditCursor);
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	clear() {
		this.auditEvents = [];
		this.nextAuditCursor = '';
		this.auditActor = '';
		this.auditTenant = '';
		this.auditAction = '';
		this.auditFrom = '';
		this.auditTo = '';
	}
}

function toISOString(value: string) {
	return value ? new Date(value).toISOString() : undefined;
}
