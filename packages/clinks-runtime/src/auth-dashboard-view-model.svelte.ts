import type { Invitation, InvitationService, Session } from '@clinks/api-client';
import { BrowserClipboard } from './browser-clipboard.ts';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte.ts';
import type { SessionStore } from './session-store.svelte';

export class AuthDashboardViewModel {
	#overrideSelectedTenant = $state<string | null>(null);
	invitationEmail = $state('');
	invitationRole = $state<'ROLE_TENANT_ADMIN' | 'ROLE_USER'>('ROLE_USER');
	createdInvitation = $state<Invitation | null>(null);

	#client: Pick<InvitationService, 'createInvitation'>;
	#session: Pick<SessionStore, 'current' | 'switchTenant'>;
	#messages: ErrorMessageFormatter;
	#clipboard: BrowserClipboard;
	#onError: (message: string) => void;

	constructor(
		client: Pick<InvitationService, 'createInvitation'>,
		session: Pick<SessionStore, 'current' | 'switchTenant'>,
		messages: ErrorMessageFormatter,
		clipboard: BrowserClipboard,
		onError: (message: string) => void,
	) {
		this.#client = client;
		this.#session = session;
		this.#messages = messages;
		this.#clipboard = clipboard;
		this.#onError = onError;
	}

	get selectedTenant() {
		return this.#overrideSelectedTenant ?? this.#session.current?.activeTenant?.id ?? '';
	}

	set selectedTenant(value: string) {
		this.#overrideSelectedTenant = value;
	}

	async selectTenant(tenantID: string) {
		if (!tenantID || tenantID === this.#session.current?.activeTenant?.id) return;
		this.#onError('');
		try {
			await this.#session.switchTenant(tenantID);
			this.#overrideSelectedTenant = null;
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	async inviteMember() {
		this.#onError('');
		try {
			this.createdInvitation = await this.#client.createInvitation(this.invitationEmail, this.invitationRole);
			this.invitationEmail = '';
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	async copyInvitation() {
		if (!this.createdInvitation) return;
		try {
			await this.#clipboard.copy(this.createdInvitation.acceptanceUrl);
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	clear() {
		this.#overrideSelectedTenant = null;
		this.invitationEmail = '';
		this.invitationRole = 'ROLE_USER';
		this.createdInvitation = null;
	}
}
