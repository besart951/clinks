import type { ConsentView } from '@clinks/contracts/newsletter';
import type { ContactId } from '@clinks/domain/ids';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** A contact's newsletter consent: the history as proof, and recording or withdrawing it by hand. */
export class ConsentModel {
	readonly history: Resource<ConsentView[]>;
	/** «Einwilligung erfassen» or «Abmelden»: the note says how it was given or withdrawn. */
	draft = $state<{ status: 'subscribed' | 'unsubscribed'; note: string } | null>(null);
	errors = $state<Record<string, string>>({});
	busy = $state(false);
	readonly #workspace: Workspace;
	/** Read when needed: the page may switch to another contact with the same card. */
	readonly #contactId: () => ContactId;

	constructor(workspace: Workspace, contactId: () => ContactId) {
		this.#workspace = workspace;
		this.#contactId = contactId;
		this.history = new Resource(workspace.db, ['newsletterConsents', 'contacts'], () =>
			workspace.newsletterConsents.history(contactId()),
		);
	}

	start(status: 'subscribed' | 'unsubscribed') {
		this.errors = {};
		this.draft = { status, note: '' };
	}

	async save() {
		const draft = this.draft;
		if (!draft) return;
		this.busy = true;
		this.errors = {};
		try {
			await this.#workspace.newsletterConsents.record(this.#contactId(), $state.snapshot(draft));
			this.draft = null;
			await this.history.reload(true);
		} catch (error) {
			this.errors = this.#workspace.fieldErrors(error);
			if (Object.keys(this.errors).length === 0) this.errors = { note: this.#workspace.message(error) };
		} finally {
			this.busy = false;
		}
	}
}
