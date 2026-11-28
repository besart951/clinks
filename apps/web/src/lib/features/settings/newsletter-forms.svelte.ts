import { publicRoutes, webLink } from '@clinks/contracts/public-links';
import type { ConsentImportResult, NewsletterFormInput, NewsletterFormView } from '@clinks/contracts/newsletter';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** The form being edited; tags are typed as a comma-separated list. */
export type FormDraft = Omit<NewsletterFormInput, 'tags'> & { id: string | null; tags: string };

/** Settings › E-Mail › Newsletter: sign-up forms with their public link, and importing consents gathered elsewhere. */
export class NewsletterFormsModel {
	readonly resource: Resource<NewsletterFormView[]>;
	draft = $state<FormDraft | null>(null);
	draftErrors = $state<Record<string, string>>({});
	importing = $state<{ emails: string; note: string; result: ConsentImportResult | null } | null>(null);
	busy = $state(false);
	readonly #workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['newsletterForms'], () => workspace.newsletterForms.list());
	}

	/** The page people sign up on; it goes on the practice's website, in mails or as QR code at the desk. */
	link(form: NewsletterFormView) {
		return webLink(location.href, publicRoutes.newsletter(form.token));
	}

	create() {
		this.draftErrors = {};
		this.draft = {
			id: null,
			title: this.#workspace.t('ui.ws.newsletter_forms.default_title'),
			intro: '',
			tags: 'Newsletter',
			consentText: this.#workspace.t('ui.ws.newsletter_forms.default_consent', {
				tenant: this.#workspace.session.tenant?.name ?? '',
			}),
			active: true,
		};
	}

	edit(form: NewsletterFormView) {
		const { token: _token, ...fields } = form;
		this.draftErrors = {};
		this.draft = { ...fields, tags: form.tags.join(', ') };
	}

	async save() {
		const draft = this.draft;
		if (!draft) return;
		const { id, tags, ...fields } = draft;
		const input = {
			...fields,
			tags: [
				...new Set(
					tags
						.split(',')
						.map((tag) => tag.trim())
						.filter(Boolean),
				),
			],
		};
		await this.#busy(async () => {
			try {
				await this.#workspace.newsletterForms.save(id, input);
				this.draft = null;
			} catch (error) {
				this.draftErrors = this.#workspace.fieldErrors(error);
				if (Object.keys(this.draftErrors).length === 0) throw error;
			}
		}, 'ui.ws.newsletter_forms.saved');
	}

	toggle(form: NewsletterFormView) {
		const { id, token: _token, ...input } = form;
		return this.#busy(() =>
			this.#workspace.newsletterForms.save(id, { ...input, active: !form.active }).then(() => {}),
		);
	}

	remove(form: NewsletterFormView) {
		return this.#busy(() => this.#workspace.newsletterForms.remove(form.id), 'ui.ws.newsletter_forms.removed');
	}

	copy(form: NewsletterFormView) {
		return this.#workspace.run(() => this.#workspace.platform.files.copyText(this.link(form)), {
			success: 'ui.ws.mail_settings.copied',
		});
	}

	startImport() {
		this.importing = { emails: '', note: '', result: null };
	}

	/** Addresses are taken from any text (a column of a CSV, a pasted list). */
	async runImport() {
		const importing = this.importing;
		if (!importing) return;
		const emails = [...new Set(importing.emails.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[a-z]{2,}/gi) ?? [])];
		await this.#busy(async () => {
			importing.result = await this.#workspace.newsletterConsents.import({ emails, note: importing.note });
		});
	}

	/** Forms are not synced: the list is reloaded after each change, with the API as in the demo. */
	async #busy(work: () => Promise<void>, success?: string) {
		this.busy = true;
		await this.#workspace.run(work, { success });
		await this.resource.reload(true);
		this.busy = false;
	}
}
