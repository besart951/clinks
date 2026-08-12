import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte';
import { centralErrorHandler } from './error-handler.ts';

export interface AuthAccessSession {
	login(credentials: { email: string; password: string }): Promise<void>;
	register(registration: { email: string; password: string; tenantName: string }): Promise<void>;
	acceptInvitation(acceptance: { token: string; email: string; password: string }): Promise<void>;
}

export class AuthAccessViewModel {
	email = $state('');
	password = $state('');
	tenantName = $state('');
	invitationToken = $state('');
	registering = $state(false);
	busy = $state(false);

	#session: AuthAccessSession;
	#messages: ErrorMessageFormatter;
	#onError: (message: string) => void;
	#onAuthenticated: () => Promise<void>;

	constructor(
		session: AuthAccessSession,
		messages: ErrorMessageFormatter,
		onError: (message: string) => void,
		onAuthenticated: () => Promise<void>,
	) {
		this.#session = session;
		this.#messages = messages;
		this.#onError = onError;
		this.#onAuthenticated = onAuthenticated;
	}

	async submit() {
		this.busy = true;
		this.#onError('');
		try {
			if (this.invitationToken) {
				await this.#session.acceptInvitation({
					token: this.invitationToken,
					email: this.email,
					password: this.password,
				});
			} else if (this.registering) {
				await this.#session.register({ email: this.email, password: this.password, tenantName: this.tenantName });
			} else {
				await this.#session.login({ email: this.email, password: this.password });
			}
			await this.#onAuthenticated();
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
