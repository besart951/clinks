import type { InvitationService, Invitation } from '@clinks/api-client';
import { SearchableViewModel } from './searchable-view-model.svelte.ts';
import type { ErrorMessageFormatter } from './error-handler.ts';

export class InvitationViewModel {
	list: SearchableViewModel<Invitation, { tenantId: string; status: string }>;
	errorMessage = $state('');

	#service: Pick<InvitationService, 'listInvitations' | 'revokeInvitation'>;
	#messages: ErrorMessageFormatter;

	constructor(
		service: Pick<InvitationService, 'listInvitations' | 'revokeInvitation'>,
		messages: ErrorMessageFormatter,
	) {
		this.#service = service;
		this.#messages = messages;
		this.list = new SearchableViewModel<Invitation, { tenantId: string; status: string }>(
			(params) =>
				this.#service
					.listInvitations({
						tenantId: params.filters.tenantId || undefined,
						status: params.filters.status || undefined,
						search: params.search || undefined,
						cursor: params.cursor || undefined,
						pageSize: 20,
					})
					.then((page) => ({ items: page.invitations, nextCursor: page.nextCursor })),
			{ tenantId: '', status: '' },
			messages,
		);
	}

	async load() {
		try {
			await this.list.refresh();
		} catch (error) {
			this.errorMessage = String(error);
		}
	}

	async revoke(invitationId: string) {
		this.errorMessage = '';
		const snapshot = this.list.items;
		this.list.items = this.list.items.filter((i) => i.id !== invitationId);
		try {
			await this.#service.revokeInvitation(invitationId);
		} catch (error) {
			this.list.items = snapshot;
			this.errorMessage = this.#messages.message(error);
		}
	}

	clear() {
		this.list.items = [];
		this.errorMessage = '';
	}
}
