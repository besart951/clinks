import type { PublicFormView, SignUpInput, UnsubscribeView } from '@clinks/contracts/newsletter';
import type { Workspace } from '../../workspace.svelte.ts';

/** The public sign-up page of a form: fields, then «Bitte bestätigen Sie die Mail». */
export class SignUpModel {
	form = $state.raw<PublicFormView | null>(null);
	fatal = $state('');
	value = $state<SignUpInput>({ firstName: '', lastName: '', email: '', consent: true, website: '' });
	agreed = $state(false);
	fields = $state<{ [field: string]: string }>({});
	busy = $state(false);
	sent = $state(false);
	/** The demo sends no mail: its confirmation link is shown on the page. */
	demoLink = $state<string | null>(null);
	readonly #workspace: Workspace;
	readonly #token: string;

	constructor(workspace: Workspace, token: string) {
		this.#workspace = workspace;
		this.#token = token;
	}

	async load() {
		try {
			this.form = await this.#workspace.newsletterForms.form(this.#token);
		} catch (error) {
			this.fatal = this.#workspace.message(error);
		}
	}

	async submit() {
		this.fields = this.agreed ? {} : { consent: this.#workspace.t('error.ws.newsletter_consent_required') };
		if (!this.agreed) return;
		this.busy = true;
		try {
			const token = await this.#workspace.newsletterForms.signUp(this.#token, $state.snapshot(this.value));
			this.demoLink = token ? `/newsletter/confirm/${token}` : null;
			this.sent = true;
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) this.fatal = this.#workspace.message(error);
		} finally {
			this.busy = false;
		}
	}
}

/** The page behind a newsletter's unsubscribe link: one click, then an optional reason. */
export class UnsubscribeModel {
	view = $state.raw<UnsubscribeView | null>(null);
	fatal = $state('');
	busy = $state(false);
	reason = $state('');
	thanked = $state(false);
	readonly #workspace: Workspace;
	readonly #token: string;

	constructor(workspace: Workspace, token: string) {
		this.#workspace = workspace;
		this.#token = token;
	}

	async load() {
		try {
			this.view = await this.#workspace.newsletterConsents.unsubscribeView(this.#token);
		} catch (error) {
			this.fatal = this.#workspace.message(error);
		}
	}

	unsubscribe() {
		return this.#busy(async () => {
			await this.#workspace.newsletterConsents.unsubscribe(this.#token);
			this.view = this.view && { ...this.view, done: true };
		});
	}

	sendReason() {
		return this.#busy(async () => {
			await this.#workspace.newsletterConsents.reason(this.#token, this.reason.trim());
			this.thanked = true;
		});
	}

	async #busy(work: () => Promise<void>) {
		this.busy = true;
		try {
			await work();
		} catch (error) {
			this.fatal = this.#workspace.message(error);
		} finally {
			this.busy = false;
		}
	}
}
