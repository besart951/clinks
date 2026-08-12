import type { ApplicationScope } from '@clinks/api-client';
import type { InvitationService } from '@clinks/api-client';
import { AuthAccessViewModel } from './auth-access-view-model.svelte.ts';
import { AuthDashboardViewModel } from './auth-dashboard-view-model.svelte.ts';
import { BrowserClipboard } from './browser-clipboard.ts';
import type { AuthAccessSession } from './auth-access-view-model.svelte.ts';
import type { AuthDashboardSession } from './auth-dashboard-view-model.svelte.ts';

export interface AuthPortalSession extends AuthAccessSession, AuthDashboardSession {
	readonly email: string;
	initialize(): Promise<void>;
}

export interface ErrorMessageFormatter {
	message(error: unknown): string;
}

export class AuthPortalViewModel {
	errorMessage = $state('');

	readonly application: ApplicationScope;
	readonly authAccess: AuthAccessViewModel;
	readonly authDashboard: AuthDashboardViewModel;

	#client: Pick<InvitationService, 'createInvitation' | 'roles'>;
	#session: AuthPortalSession;
	#messages: ErrorMessageFormatter;

	constructor(
		application: ApplicationScope,
		client: Pick<InvitationService, 'createInvitation' | 'roles'>,
		session: AuthPortalSession,
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

		this.authDashboard = new AuthDashboardViewModel(this.#client, session, this.#messages, clipboard, setError);
		this.authAccess = new AuthAccessViewModel(session, this.#messages, setError, () => this.authDashboard.loadRoles());
	}

	async initialize(invitationToken = '') {
		this.authAccess.invitationToken = invitationToken;
		await this.#session.initialize();
		if (this.#session.current) await this.authDashboard.loadRoles();
	}

	get sessionEmail() {
		return this.#session.email;
	}
}
