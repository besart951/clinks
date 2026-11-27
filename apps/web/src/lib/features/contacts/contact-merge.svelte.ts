import {
	blankMerge,
	conflicting,
	initialMerge,
	mergeFields,
	mergePatch,
	mergeValue,
	type MergeField,
	type MergeValues,
} from '@clinks/domain/contact-merge';
import type { Contact } from '@clinks/domain/types';

/**
 * Merging contacts field by field: the kept contact on the left, another one on the right (one at a time when more
 * are merged) and the result in the middle, where values are taken from either side or typed.
 */
export class ContactMergeModel {
	contacts = $state.raw<Contact[]>([]);
	keptId = $state('');
	otherId = $state('');
	values = $state<MergeValues>(blankMerge());

	get kept(): Contact | undefined {
		return this.contacts.find((contact) => contact.id === this.keptId);
	}

	/** The one shown on the right. */
	get other(): Contact | undefined {
		return this.contacts.find((contact) => contact.id === this.otherId);
	}

	/** Everyone merged into the kept contact. */
	get others(): Contact[] {
		return this.contacts.filter((contact) => contact.id !== this.keptId);
	}

	/** The rows worth showing: fields that any of the contacts has. */
	get fields(): MergeField[] {
		return mergeFields.filter((field) => this.contacts.some((contact) => mergeValue(contact, field).trim()));
	}

	/** How many fields still differ between the two sides. */
	get conflicts(): number {
		const [kept, other] = [this.kept, this.other];
		return kept && other ? this.fields.filter((field) => conflicting(kept, other, field)).length : 0;
	}

	start(contacts: Contact[]) {
		this.contacts = contacts;
		this.keptId = contacts[0]?.id ?? '';
		this.otherId = contacts[1]?.id ?? '';
		this.#reset();
	}

	/** The right one is kept instead; the result starts again from it. */
	swap() {
		[this.keptId, this.otherId] = [this.otherId, this.keptId];
		this.#reset();
	}

	take(field: MergeField, from: Contact) {
		this.values[field] = mergeValue(from, field);
	}

	/** Both sides hold the same (or nothing): nothing to decide, the row is greyed. */
	same(field: MergeField): boolean {
		const [kept, other] = [this.kept, this.other];
		return !!kept && !!other && mergeValue(kept, field).trim() === mergeValue(other, field).trim();
	}

	/** The middle already holds this side's value. */
	taken(field: MergeField, from: Contact): boolean {
		return this.values[field].trim() === mergeValue(from, field).trim();
	}

	patch(): Partial<Contact> {
		return mergePatch($state.snapshot(this.values), this.contacts);
	}

	#reset() {
		const kept = this.kept;
		if (kept) this.values = initialMerge(kept, this.others);
	}
}
