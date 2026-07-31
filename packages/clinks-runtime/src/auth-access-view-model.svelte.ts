import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte';
import { centralErrorHandler } from './error-handler.ts';
import type { SessionStore } from './session-store.svelte';

export class AuthAccessViewModel {
	email = $state('');
	password = $state('');
	tenantName = $state('');
	invitationToken = $state('');
	registering = $state(false);
	busy = $state(false);

	#session: Pick<SessionStore, 'acceptInvitation' | 'login' | 'register' | 'current'>;
	#messages: ErrorMessageFormatter;
	#onError: (message: string) => void;

	constructor(
		session: Pick<SessionStore, 'acceptInvitation' | 'login' | 'register' | 'current'>,
		messages: ErrorMessageFormatter,
		onError: (message: string) => void,
	) {
		this.#session = session;
		this.#messages = messages;
		this.#onError = onError;
	}

	async submit() {
		this.busy = true;
		this.#onError('');
		try {
			if (this.invitationToken) {
				await this.#session.acceptInvitation(this.invitationToken, this.email, this.password);
			} else if (this.registering) {
				await this.#session.register(this.email, this.password, this.tenantName);
			} else {
				await this.#session.login(this.email, this.password);
			}
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
