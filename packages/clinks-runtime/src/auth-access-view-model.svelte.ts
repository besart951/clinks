import type { ErrorMessageFormatter } from './error-handler.ts';

export interface AuthAccessSession {
	login(credentials: { email: string; password: string }): Promise<void>;
	register(registration: { email: string; password: string; tenantName: string }): Promise<void>;
	acceptInvitation(acceptance: { token: string; email: string; password: string }): Promise<void>;
}

export class AuthAccessViewModel {
	email = $state('');
	password = $state('');
	tenantName = $state('');
	busy = $state(false);
	errorMessage = $state('');

	#session: AuthAccessSession;
	#messages: ErrorMessageFormatter;
	#onAuthenticated: () => Promise<void>;

	constructor(session: AuthAccessSession, messages: ErrorMessageFormatter, onAuthenticated: () => Promise<void>) {
		this.#session = session;
		this.#messages = messages;
		this.#onAuthenticated = onAuthenticated;
	}

	async login() {
		await this.#submit(() => this.#session.login({ email: this.email, password: this.password }));
	}

	async register() {
		await this.#submit(() =>
			this.#session.register({ email: this.email, password: this.password, tenantName: this.tenantName }),
		);
	}

	async acceptInvitation(token: string) {
		await this.#submit(() => this.#session.acceptInvitation({ token, email: this.email, password: this.password }));
	}

	clear() {
		this.email = '';
		this.password = '';
		this.tenantName = '';
		this.busy = false;
		this.errorMessage = '';
	}

	async #submit(action: () => Promise<void>) {
		if (this.busy) return;
		this.busy = true;
		this.errorMessage = '';
		try {
			await action();
			await this.#onAuthenticated();
		} catch (error) {
			this.errorMessage = this.#messages.message(error);
		} finally {
			this.busy = false;
		}
	}
}
