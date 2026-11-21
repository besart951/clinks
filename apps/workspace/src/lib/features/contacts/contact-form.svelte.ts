import { toast } from 'svelte-sonner';
import type { Contact } from '../../domain/types.ts';
import { emptyContact } from './empty-contact.ts';
import type { Draft } from '../../data/repository.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** Create or edit one contact; field errors come back localized from the mock API. */
export class ContactFormModel {
	value = $state<Draft<Contact>>(emptyContact());
	tagInput = $state('');
	busy = $state(false);
	fields = $state<{ [field: string]: string }>({});
	#original: Contact | null = null;
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(JSON.stringify(this.value) !== this.#initial);

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	get editing() {
		return this.#original !== null;
	}

	start(contact: Contact | null, preset: Partial<Draft<Contact>> = {}) {
		this.#original = contact;
		this.value = contact ? structuredClone($state.snapshot(contact)) : { ...emptyContact(), ...preset };
		this.#initial = JSON.stringify(this.value);
		this.fields = {};
		this.tagInput = '';
	}

	addTag() {
		const tag = this.tagInput.trim();
		if (tag && !this.value.tags.includes(tag)) this.value.tags = [...this.value.tags, tag];
		this.tagInput = '';
	}

	removeTag(tag: string) {
		this.value.tags = this.value.tags.filter((candidate) => candidate !== tag);
	}

	async save(): Promise<Contact | null> {
		this.busy = true;
		this.fields = {};
		try {
			const api = this.#workspace.api.contacts;
			const draft = $state.snapshot(this.value) as Draft<Contact>;
			const saved = this.#original
				? await api.update(this.#original.id, this.#original.revision, draft)
				: await api.create(draft);
			this.#initial = JSON.stringify(this.value);
			return saved;
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) toast.error(this.#workspace.message(error));
			return null;
		} finally {
			this.busy = false;
		}
	}
}
