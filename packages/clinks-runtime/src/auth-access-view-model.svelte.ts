import type { ClinksClient, Session } from '@clinks/api-client';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte';
import { centralErrorHandler } from './error-handler.ts';

export class AuthAccessViewModel {
	email = $state('');
	password = $state('');
	tenantName = $state('');
	invitationToken = $state('');
	registering = $state(false);
	busy = $state(false);

	#client: Pick<ClinksClient, 'acceptInvitation' | 'login' | 'register'>;
	#messages: ErrorMessageFormatter;
	#setSession: (session: Session) => void;
	#onError: (message: string) => void;

	constructor(
		client: Pick<ClinksClient, 'acceptInvitation' | 'login' | 'register'>,
		messages: ErrorMessageFormatter,
		setSession: (session: Session) => void,
		onError: (message: string) => void,
	) {
		this.#client = client;
		this.#messages = messages;
		this.#setSession = setSession;
		this.#onError = onError;
	}

	async submit() {
		this.busy = true;
		this.#onError('');
		try {
			const session = this.invitationToken
				? await this.#client.acceptInvitation(this.invitationToken, this.email, this.password)
				: this.registering
					? await this.#client.register(this.email, this.password, this.tenantName)
					: await this.#client.login(this.email, this.password);
			this.#setSession(session);
		} catch (error) {
			const detail = centralErrorHandler.handleError(error, this.#messages.message(error));
			this.#onError(detail.message);
		} finally {
			this.busy = false;
		}
	}

	toggleRegistration() {
		this.registering = !this.registering;
		this.#onError('');
	}

	clear() {
		this.email = '';
		this.password = '';
		this.tenantName = '';
		this.invitationToken = '';
		this.registering = false;
		this.busy = false;
	}
}
