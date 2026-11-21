import type { ContactId } from '../../domain/ids.ts';
import type { Appointment, Contact, Invoice, MailMessage, Task } from '../../domain/types.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface ContactDetail {
	contact: Contact;
	appointments: Appointment[];
	invoices: Invoice[];
	mails: MailMessage[];
	tasks: Task[];
}

async function optional<T>(enabled: boolean, load: () => Promise<T[]>): Promise<T[]> {
	if (!enabled) return [];
	try {
		return await load();
	} catch {
		return [];
	}
}

/** One contact with everything the other modules hold about them. */
export class ContactDetailModel {
	readonly resource: Resource<ContactDetail>;
	#workspace: Workspace;

	constructor(workspace: Workspace, id: ContactId) {
		this.#workspace = workspace;
		const { api, session } = workspace;
		this.resource = new Resource(workspace.db, ['contacts', 'appointments', 'invoices', 'mails', 'tasks'], async () => {
			const contact = await api.contacts.get(id);
			const [appointments, invoices, mails, tasks] = await Promise.all([
				optional(session.can('calendar.read'), () => api.appointments.list((row) => row.contactId === id)),
				optional(session.can('finance.read') && session.hasModule('finance'), () =>
					api.invoices.list((row) => row.contactId === id),
				),
				optional(session.can('mail.read') && session.hasModule('mail'), () =>
					api.mails.list(
						(row) =>
							row.contactId === id ||
							(!!contact.email && (row.from === contact.email || row.to.includes(contact.email))),
					),
				),
				optional(session.can('planner.read') && session.hasModule('planner'), () =>
					api.tasks.list((row) => row.contactId === id),
				),
			]);
			return {
				contact,
				appointments: appointments.sort((left, right) => right.start.localeCompare(left.start)),
				invoices: invoices.sort((left, right) => right.issueDate.localeCompare(left.issueDate)),
				mails: mails.sort((left, right) => right.sentAt.localeCompare(left.sentAt)),
				tasks,
			};
		});
	}

	async setArchived(contact: Contact, archived: boolean) {
		await this.#workspace.run(() => this.#workspace.api.contacts.update(contact.id, contact.revision, { archived }), {
			success: archived ? 'ui.ws.contacts.archived' : 'ui.ws.contacts.unarchived',
			successParams: { count: 1 },
		});
	}

	async remove(contact: Contact) {
		const api = this.#workspace.api.contacts;
		return this.#workspace.run(() => api.remove(contact.id), {
			success: 'ui.ws.contacts.deleted',
			successParams: { count: 1 },
			undo: () => api.restore(contact),
		});
	}
}
