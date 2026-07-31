import type { AuditEvent, AuditService } from '@clinks/api-client';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte';

export class AuditLogViewModel {
	auditEvents = $state<AuditEvent[]>([]);
	nextAuditCursor = $state('');
	auditActor = $state('');
	auditTenant = $state('');
	auditAction = $state('');
	auditFrom = $state('');
	auditTo = $state('');
	error = $state('');
	busy = $state(false);

	#service: AuditService;
	#messages: ErrorMessageFormatter;

	constructor(service: AuditService, messages: ErrorMessageFormatter) {
		this.#service = service;
		this.#messages = messages;
	}

	formatDate(dateString: string, locale: string): string {
		if (!dateString) return '';
		return new Date(dateString).toLocaleString(locale);
	}

	async load(cursor = '') {
		const page = await this.#service.auditEvents({
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
		if (this.busy) return;
		this.busy = true;
		this.error = '';
		try {
			await this.load();
		} catch (error) {
			this.error = this.#messages.message(error);
		} finally {
			this.busy = false;
		}
	}

	async loadMoreAuditEvents() {
		if (this.busy || !this.nextAuditCursor) return;
		this.busy = true;
		this.error = '';
		try {
			await this.load(this.nextAuditCursor);
		} catch (error) {
			this.error = this.#messages.message(error);
		} finally {
			this.busy = false;
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
		this.error = '';
		this.busy = false;
	}
}

function toISOString(value: string) {
	return value ? new Date(value).toISOString() : undefined;
}
