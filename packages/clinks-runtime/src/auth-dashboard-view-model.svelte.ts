import type { ClinksClient, Invitation, Session } from '@clinks/api-client';
import { BrowserClipboard } from './browser-clipboard.ts';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte.ts';

export class AuthDashboardViewModel {
	selectedTenant = $state('');
	invitationEmail = $state('');
	invitationRole = $state<'ROLE_TENANT_ADMIN' | 'ROLE_USER'>('ROLE_USER');
	createdInvitation = $state<Invitation | null>(null);

	#client: Pick<ClinksClient, 'createInvitation' | 'switchTenant'>;
	#messages: ErrorMessageFormatter;
	#clipboard: BrowserClipboard;
	#getSession: () => Session | null;
	#setSession: (session: Session) => void;
	#onError: (message: string) => void;

	constructor(
		client: Pick<ClinksClient, 'createInvitation' | 'switchTenant'>,
		messages: ErrorMessageFormatter,
		clipboard: BrowserClipboard,
		getSession: () => Session | null,
		setSession: (session: Session) => void,
		onError: (message: string) => void,
	) {
		this.#client = client;
		this.#messages = messages;
		this.#clipboard = clipboard;
		this.#getSession = getSession;
		this.#setSession = setSession;
		this.#onError = onError;
	}

	async selectTenant(tenantID: string) {
		const session = this.#getSession();
		if (!tenantID || tenantID === session?.activeTenant?.id) return;
		this.#onError('');
		try {
			this.#setSession(await this.#client.switchTenant(tenantID));
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

	syncSelectedTenant(session: Session | null) {
		this.selectedTenant = session?.activeTenant?.id ?? '';
	}

	clear() {
		this.selectedTenant = '';
		this.invitationEmail = '';
		this.invitationRole = 'ROLE_USER';
		this.createdInvitation = null;
	}
}
