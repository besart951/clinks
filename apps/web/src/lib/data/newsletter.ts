import type {
	AudienceView,
	ConfirmedView,
	ConsentImportResult,
	ConsentInput,
	ConsentView,
	NewsletterFormInput,
	NewsletterFormView,
	PublicFormView,
	SignUpInput,
	UnsubscribeView,
} from '@clinks/contracts/newsletter';
import type { CampaignId, ContactId } from '@clinks/domain/ids';
import type { ApiClient } from './api-client.ts';
import type { WorkspaceApi } from './workspace-api.ts';

const path = encodeURIComponent;

/** Through the API when there is one, else the demo's stand-in. */
abstract class Backend {
	readonly #client: ApiClient | null;
	readonly #api: () => WorkspaceApi;
	constructor(client: ApiClient | null, api: () => WorkspaceApi) {
		this.#client = client;
		this.#api = api;
	}

	/** True in the demo: no mail leaves the browser, so links are shown on the page instead. */
	get demo() {
		return this.#client === null;
	}

	protected call<T>(remote: (client: ApiClient) => Promise<T>, mock: (api: WorkspaceApi) => Promise<T>): Promise<T> {
		return this.#client ? remote(this.#client) : mock(this.#api());
	}
}

/** Sign-up forms (Settings › E-Mail) and their public page with double opt-in. */
export class NewsletterForms extends Backend {
	list(): Promise<NewsletterFormView[]> {
		return this.call(
			(client) => client.request('GET', '/mail/newsletter-forms'),
			(api) => api.newsletterForms.list(),
		);
	}

	save(id: string | null, input: NewsletterFormInput): Promise<NewsletterFormView> {
		return this.call(
			(client) => client.request('POST', id ? `/mail/newsletter-forms/${id}` : '/mail/newsletter-forms', input),
			(api) => api.newsletterForms.save(id, input),
		);
	}

	remove(id: string): Promise<void> {
		return this.call(
			(client) => client.request('DELETE', `/mail/newsletter-forms/${id}`),
			(api) => api.newsletterForms.remove(id),
		);
	}

	form(token: string): Promise<PublicFormView> {
		return this.call(
			(client) => client.request('GET', `/newsletter/forms/${path(token)}`),
			(api) => api.newsletterForms.form(token),
		);
	}

	/** Resolves with the demo's confirmation link (no mail leaves the browser), or null with the API. */
	signUp(token: string, input: SignUpInput): Promise<string | null> {
		return this.call(
			async (client) => {
				await client.request('POST', `/newsletter/forms/${path(token)}`, input);
				return null;
			},
			async (api) => {
				await api.newsletterForms.signUp(token, input);
				return api.newsletterForms.lastConfirmToken;
			},
		);
	}

	confirm(token: string): Promise<ConfirmedView> {
		return this.call(
			(client) => client.request('POST', `/newsletter/confirm/${path(token)}`, {}),
			(api) => api.newsletterForms.confirm(token),
		);
	}
}

/** A contact's consent and its history, imports, and the page behind the unsubscribe link. */
export class NewsletterConsents extends Backend {
	history(contactId: ContactId): Promise<ConsentView[]> {
		return this.call(
			(client) => client.request('GET', `/contacts/${contactId}/newsletter`),
			(api) => api.newsletterConsents.history(contactId),
		);
	}

	record(contactId: ContactId, input: ConsentInput): Promise<void> {
		return this.call(
			(client) => client.request('POST', `/contacts/${contactId}/newsletter`, input),
			(api) => api.newsletterConsents.record(contactId, input),
		);
	}

	import(input: { emails: string[]; note: string }): Promise<ConsentImportResult> {
		return this.call(
			(client) => client.request('POST', '/mail/newsletter-consents/import', input),
			(api) => api.newsletterConsents.import(input),
		);
	}

	unsubscribeView(token: string): Promise<UnsubscribeView> {
		return this.call(
			(client) => client.request('GET', `/newsletter/unsubscribe/${path(token)}`),
			(api) => api.newsletterConsents.unsubscribeView(token),
		);
	}

	/** The same endpoint mail apps use for one-click unsubscribe (RFC 8058). */
	unsubscribe(token: string): Promise<void> {
		return this.call(
			(client) => client.request('POST', `/mail/unsubscribe/${path(token)}`),
			(api) => api.newsletterConsents.unsubscribe(token),
		);
	}

	reason(token: string, reason: string): Promise<void> {
		return this.call(
			(client) => client.request('POST', `/newsletter/unsubscribe/${path(token)}/reason`, { reason }),
			(api) => api.newsletterConsents.unsubscribeReason(token),
		);
	}
}

/** The steps of a campaign after editing: review, approval, sending; and who it reaches. */
export class CampaignWorkflow extends Backend {
	readonly #sync: () => { uploaded(): Promise<void> } | null;
	constructor(client: ApiClient | null, api: () => WorkspaceApi, sync: () => { uploaded(): Promise<void> } | null) {
		super(client, api);
		this.#sync = sync;
	}

	audience(id: CampaignId): Promise<AudienceView> {
		return this.call(
			(client) => client.request('GET', `/mail/campaigns/${id}/audience`),
			(api) => api.campaignWorkflow.audience(id),
		);
	}

	/** The server checks the content it has: the edits saved on this device are uploaded first. */
	step(id: CampaignId, step: 'review' | 'withdraw' | 'approve' | 'test'): Promise<void> {
		return this.call(
			async (client) => {
				await this.#sync()?.uploaded();
				await client.request('POST', `/mail/campaigns/${id}/${step}`, {});
			},
			(api) => api.campaignWorkflow[step](id),
		);
	}

	/** «Planen» at `at`, or «Jetzt senden» with null. */
	schedule(id: CampaignId, at: string | null): Promise<void> {
		return this.call(
			async (client) => {
				await this.#sync()?.uploaded();
				await client.request('POST', `/mail/campaigns/${id}/schedule`, { at });
			},
			(api) => api.campaignWorkflow.schedule(id, at),
		);
	}
}
