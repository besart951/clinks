import type { Session } from '../../session/session.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** Where a person lands after signing in, based on their session. */
export function landingPath(session: Session): string {
	if (session.status === 'two_factor') return '/two-factor';
	if (session.status === 'verify_email') return '/verify-email';
	if (session.status !== 'authenticated') return '/login';
	if (session.isSuperAdministrator && !session.tenantId) return '/admin';
	if (!session.tenantId) return '/onboarding';
	return '/dashboard';
}

abstract class Form {
	busy = $state(false);
	error = $state('');
	fields = $state<{ [field: string]: string }>({});
	protected workspace: Workspace;

	constructor(workspace: Workspace) {
		this.workspace = workspace;
	}

	protected async submitWith(action: () => Promise<void>): Promise<boolean> {
		this.busy = true;
		this.error = '';
		this.fields = {};
		try {
			await action();
			return true;
		} catch (error) {
			this.error = this.workspace.message(error);
			this.fields = this.workspace.fieldErrors(error);
			return false;
		} finally {
			this.busy = false;
		}
	}
}

export class LoginForm extends Form {
	email = $state('');
	password = $state('');

	submit() {
		return this.submitWith(async () => {
			await this.workspace.session.signIn(this.email, this.password);
		});
	}
}

export class SignupForm extends Form {
	firstName = $state('');
	lastName = $state('');
	email = $state('');
	password = $state('');
	acceptedTerms = $state(false);

	async submit() {
		if (!this.acceptedTerms) {
			this.error = this.workspace.t('error.validation');
			this.fields = { terms: this.workspace.t('ui.ws.auth.accept_terms_required') };
			return false;
		}
		return this.submitWith(() =>
			this.workspace.session.signUp({
				firstName: this.firstName,
				lastName: this.lastName,
				email: this.email,
				password: this.password,
			}),
		);
	}
}

export class CodeForm extends Form {
	code = $state('');
	#confirm: (code: string) => Promise<void>;

	constructor(workspace: Workspace, confirm: (code: string) => Promise<void>) {
		super(workspace);
		this.#confirm = confirm;
	}

	submit() {
		return this.submitWith(() => this.#confirm(this.code));
	}
}

export class PasswordResetForm extends Form {
	step = $state<'request' | 'sent' | 'reset' | 'done'>('request');
	email = $state('');
	/** The demo code, or the token from the link in the reset mail. */
	code = $state('');
	password = $state('');
	/** Opened from the mail link: the token is known, only the new password is missing. */
	fromLink = $state(false);

	constructor(workspace: Workspace, linkToken: string | null = null) {
		super(workspace);
		if (linkToken) {
			this.code = linkToken;
			this.fromLink = true;
			this.step = 'reset';
		}
	}

	request() {
		return this.submitWith(async () => {
			await this.workspace.auth.requestPasswordReset(this.email);
			this.step = 'sent';
		});
	}

	reset() {
		return this.submitWith(async () => {
			await this.workspace.auth.resetPassword({ email: this.email, token: this.code, password: this.password });
			this.step = 'done';
		});
	}
}
