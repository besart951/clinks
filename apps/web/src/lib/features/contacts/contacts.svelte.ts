import type { ContactId } from '@clinks/domain/ids';
import type { Contact } from '@clinks/domain/types';
import { contactName } from '../../data/workspace-api.ts';
import type { Draft } from '@clinks/contracts/repository';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import { duplicateKey } from './csv.ts';

export type ContactSort = 'name' | 'city' | 'created';

/** The contact list with search, filters, selection and bulk actions. */
export class ContactsModel {
	readonly resource: Resource<Contact[]>;
	search = $state('');
	tag = $state('');
	kind = $state<'all' | 'person' | 'company'>('all');
	showArchived = $state(false);
	sort = $state<ContactSort>('name');
	selected = $state<ContactId[]>([]);
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['contacts'], () => workspace.api.contacts.list());
	}

	get tags(): string[] {
		return [...new Set((this.resource.data ?? []).flatMap((contact) => contact.tags))].sort((left, right) =>
			left.localeCompare(right),
		);
	}

	get visible(): Contact[] {
		const query = this.search.trim().toLowerCase();
		const rows = (this.resource.data ?? []).filter(
			(contact) =>
				contact.archived === this.showArchived &&
				(this.kind === 'all' || contact.kind === this.kind) &&
				(!this.tag || contact.tags.includes(this.tag)) &&
				(!query ||
					[contactName(contact), contact.email, contact.phone, contact.address.city]
						.join(' ')
						.toLowerCase()
						.includes(query)),
		);
		const key = (contact: Contact) =>
			this.sort === 'city'
				? contact.address.city
				: this.sort === 'created'
					? contact.createdAt
					: contact.kind === 'company'
						? contact.companyName
						: contact.lastName;
		return rows.sort((left, right) =>
			this.sort === 'created' ? key(right).localeCompare(key(left)) : key(left).localeCompare(key(right), 'de'),
		);
	}

	/** Groups of two or more contacts that look like the same person. */
	get duplicates(): Contact[][] {
		const groups = new Map<string, Contact[]>();
		for (const contact of (this.resource.data ?? []).filter((row) => !row.archived)) {
			const key = duplicateKey(contact);
			groups.set(key, [...(groups.get(key) ?? []), contact]);
		}
		return [...groups.values()].filter((group) => group.length > 1);
	}

	toggle(id: ContactId) {
		this.selected = this.selected.includes(id)
			? this.selected.filter((candidate) => candidate !== id)
			: [...this.selected, id];
	}

	toggleAll() {
		const ids = this.visible.map((contact) => contact.id);
		this.selected = ids.every((id) => this.selected.includes(id)) ? [] : ids;
	}

	async archive(contacts: Contact[], archived: boolean) {
		const api = this.#workspace.api.contacts;
		await this.#workspace.run(
			() => Promise.all(contacts.map((contact) => api.update(contact.id, contact.revision, { archived }))),
			{
				success: archived ? 'ui.ws.contacts.archived' : 'ui.ws.contacts.unarchived',
				successParams: { count: contacts.length },
			},
		);
		this.selected = [];
	}

	async remove(contacts: Contact[]) {
		const api = this.#workspace.api.contacts;
		const ids = new Set<string>(contacts.map((contact) => contact.id));
		this.resource.patch((rows) => rows.filter((row) => !ids.has(row.id)));
		this.selected = [];
		await this.#workspace.run(() => Promise.all(contacts.map((contact) => api.remove(contact.id))), {
			success: 'ui.ws.contacts.deleted',
			successParams: { count: contacts.length },
			undo: () => Promise.all(contacts.map((contact) => api.restore(contact))),
		});
	}

	async importContacts(drafts: Draft<Contact>[]) {
		const api = this.#workspace.api.contacts;
		const result = await this.#workspace.run(
			async () => {
				const created: Contact[] = [];
				for (const draft of drafts) created.push(await api.create(draft));
				return created;
			},
			{ success: 'ui.ws.contacts.imported', successParams: { count: drafts.length } },
		);
		return result !== null;
	}

	/** Keeps `primary` with the decided values (`@clinks/domain/contact-merge`) and moves all references to it. */
	async merge(primary: Contact, others: Contact[], patch: Partial<Contact>) {
		const { api } = this.#workspace;
		const otherIds = new Set<string>(others.map((contact) => contact.id));
		const done = await this.#workspace.run(
			async () => {
				const repoint = async <T extends { id: string; revision: number; contactId: ContactId | null }>(
					rows: T[],
					update: (id: T['id'], revision: number, patch: { contactId: ContactId }) => Promise<unknown>,
				) => {
					for (const row of rows.filter((candidate) => candidate.contactId && otherIds.has(candidate.contactId))) {
						await update(row.id, row.revision, { contactId: primary.id });
					}
				};
				await repoint(await api.appointments.list(), (id, revision, patch) =>
					api.appointments.update(id, revision, patch),
				);
				await repoint(await api.tasks.list(), (id, revision, patch) => api.tasks.update(id, revision, patch));
				await repoint(await api.mails.list(), (id, revision, patch) => api.mails.update(id, revision, patch));
				if (this.#workspace.session.can('finance.read')) {
					await repoint(await api.invoices.list(), (id, revision, patch) => api.invoices.update(id, revision, patch));
				}
				await api.contacts.update(primary.id, primary.revision, patch);
				for (const other of others) await api.contacts.remove(other.id);
			},
			{ success: 'ui.ws.contacts.merged', successParams: { count: others.length + 1 } },
		);
		this.selected = [];
		return done !== null;
	}
}
