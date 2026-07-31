import type { ApplicationScope } from '@clinks/api-client';
import type { InvitationService } from '@clinks/api-client';
import { AuthAccessViewModel } from './auth-access-view-model.svelte.ts';
import { AuthDashboardViewModel } from './auth-dashboard-view-model.svelte.ts';
import { BrowserClipboard } from './browser-clipboard.ts';
import type { SessionStore } from './session-store.svelte';

export interface ErrorMessageFormatter {
	message(error: unknown): string;
}

export class AuthPortalViewModel {
	errorMessage = $state('');

	readonly application: ApplicationScope;
	readonly authAccess: AuthAccessViewModel;
	readonly authDashboard: AuthDashboardViewModel;

	#client: Pick<InvitationService, 'createInvitation'>;
	#session: SessionStore;
	#messages: ErrorMessageFormatter;

	constructor(
		application: ApplicationScope,
		client: Pick<InvitationService, 'createInvitation'>,
		session: SessionStore,
		messages: ErrorMessageFormatter,
		clipboard: BrowserClipboard,
	) {
		this.application = application;
		this.#client = client;
		this.#session = session;
		this.#messages = messages;

		const setError = (msg: string) => {
			this.errorMessage = msg;
		};

		this.authAccess = new AuthAccessViewModel(session, this.#messages, setError);
		this.authDashboard = new AuthDashboardViewModel(this.#client, session, this.#messages, clipboard, setError);
	}

	async initialize(invitationToken = '') {
		this.authAccess.invitationToken = invitationToken;
		await this.#session.hydrate();
	}

	get sessionEmail() {
		return this.#session.email;
	}

	get canInviteMembers() {
		return this.#session.memberships.some(
			(m) => m.tenant.id === this.#session.activeTenant?.id && m.role === 'ROLE_TENANT_ADMIN',
		);
	}
}
