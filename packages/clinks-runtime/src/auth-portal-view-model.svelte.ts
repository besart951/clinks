import type { ApplicationScope, ClinksClient, Session } from '@clinks/api-client';
import { AuthAccessViewModel } from './auth-access-view-model.svelte.ts';
import { AuthDashboardViewModel } from './auth-dashboard-view-model.svelte.ts';
import { BrowserClipboard } from './browser-clipboard.ts';

export interface ErrorMessageFormatter {
	message(error: unknown): string;
}

export class AuthPortalViewModel {
	session = $state<Session | null>(null);
	errorMessage = $state('');

	readonly application: ApplicationScope;
	readonly authAccess: AuthAccessViewModel;
	readonly authDashboard: AuthDashboardViewModel;

	#client: Pick<
		ClinksClient,
		'acceptInvitation' | 'createInvitation' | 'getSession' | 'login' | 'logout' | 'register' | 'switchTenant'
	>;
	#messages: ErrorMessageFormatter;

	constructor(
		application: ApplicationScope,
		client: Pick<
			ClinksClient,
			'acceptInvitation' | 'createInvitation' | 'getSession' | 'login' | 'logout' | 'register' | 'switchTenant'
		>,
		messages: ErrorMessageFormatter,
		clipboard: BrowserClipboard,
	) {
		this.application = application;
		this.#client = client;
		this.#messages = messages;

		const setError = (msg: string) => {
			this.errorMessage = msg;
		};
		const updateSession = (session: Session | null) => {
			this.setSession(session);
		};

		this.authAccess = new AuthAccessViewModel(this.#client, this.#messages, updateSession, setError);
		this.authDashboard = new AuthDashboardViewModel(
			this.#client,
			this.#messages,
			clipboard,
			() => this.session,
			updateSession,
			setError,
		);
	}

	async initialize(invitationToken = '') {
		this.authAccess.invitationToken = invitationToken;
		await this.hydrateSession();
	}

	async signOut() {
		try {
			await this.#client.logout();
		} finally {
			this.setSession(null);
			this.authAccess.clear();
			this.authDashboard.clear();
		}
	}

	get sessionEmail() {
		return this.session?.user.email ?? '';
	}

	get canInviteMembers() {
		return (
			this.session?.memberships.some(
				(membership) =>
					membership.tenant.id === this.session?.activeTenant?.id && membership.role === 'ROLE_TENANT_ADMIN',
			) ?? false
		);
	}

	private async hydrateSession() {
		try {
			this.setSession(await this.#client.getSession());
		} catch {
			this.setSession(null);
		}
	}

	private setSession(session: Session | null) {
		this.session = session;
		this.authDashboard.syncSelectedTenant(session);
	}
}
