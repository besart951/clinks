import type { MailId } from '../../domain/ids.ts';
import type { Contact, MailFolder, MailMessage, MailTemplate } from '../../domain/types.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface MailboxData {
	mails: MailMessage[];
	contacts: Contact[];
	templates: MailTemplate[];
}

/** Folders, reading pane and the actions on a message. */
export class MailboxModel {
	readonly resource: Resource<MailboxData>;
	folder = $state<MailFolder>('inbox');
	selectedId = $state<MailId | null>(null);
	search = $state('');
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['mails', 'contacts', 'templates'], async () => {
			const [mails, contacts, templates] = await Promise.all([
				workspace.api.mails.list(),
				workspace.session.can('contacts.read') ? workspace.api.contacts.list() : Promise.resolve([]),
				workspace.api.templates.list(),
			]);
			return { mails, contacts, templates };
		});
	}

	get messages(): MailMessage[] {
		const query = this.search.trim().toLowerCase();
		return (this.resource.data?.mails ?? [])
			.filter(
				(mail) =>
					mail.folder === this.folder &&
					(!query || `${mail.subject} ${mail.fromName} ${mail.from} ${mail.body}`.toLowerCase().includes(query)),
			)
			.sort((left, right) => right.sentAt.localeCompare(left.sentAt));
	}

	get selected(): MailMessage | null {
		return this.resource.data?.mails.find((mail) => mail.id === this.selectedId) ?? null;
	}

	unread(folder: MailFolder) {
		return (this.resource.data?.mails ?? []).filter((mail) => mail.folder === folder && !mail.read).length;
	}

	count(folder: MailFolder) {
		return (this.resource.data?.mails ?? []).filter((mail) => mail.folder === folder).length;
	}

	contactFor(mail: MailMessage): Contact | null {
		const contacts = this.resource.data?.contacts ?? [];
		return (
			contacts.find((contact) => contact.id === mail.contactId) ??
			contacts.find((contact) => contact.email && (contact.email === mail.from || mail.to.includes(contact.email))) ??
			null
		);
	}

	async select(mail: MailMessage) {
		this.selectedId = mail.id;
		if (!mail.read && this.#workspace.session.can('mail.write')) {
			this.resource.patch((data) => ({
				...data,
				mails: data.mails.map((row) => (row.id === mail.id ? { ...row, read: true } : row)),
			}));
			await this.#workspace.api.mails.update(mail.id, mail.revision, { read: true }).catch(() => undefined);
		}
	}

	async toggleStar(mail: MailMessage) {
		await this.#workspace.run(() =>
			this.#workspace.api.mails.update(mail.id, mail.revision, { starred: !mail.starred }),
		);
	}

	async markUnread(mail: MailMessage) {
		await this.#workspace.run(() => this.#workspace.api.mails.update(mail.id, mail.revision, { read: false }));
		this.selectedId = null;
	}

	async moveTo(mail: MailMessage, folder: MailFolder) {
		const previous = mail.folder;
		this.selectedId = null;
		await this.#workspace.run(() => this.#workspace.api.mails.update(mail.id, mail.revision, { folder }), {
			success: 'ui.ws.mail.moved',
			successParams: { folder: this.#workspace.t(`ui.ws.mail.folder.${folder}`) },
			undo: async () => {
				const current = await this.#workspace.api.mails.get(mail.id);
				return this.#workspace.api.mails.update(current.id, current.revision, { folder: previous });
			},
		});
	}

	async remove(mail: MailMessage) {
		const api = this.#workspace.api.mails;
		this.selectedId = null;
		await this.#workspace.run(() => api.remove(mail.id), {
			success: 'ui.ws.mail.deleted',
			undo: () => api.restore(mail),
		});
	}

	async toTask(mail: MailMessage) {
		const me = this.#workspace.session.user?.id;
		const task = await this.#workspace.run(
			() =>
				this.#workspace.api.tasks.create({
					title: mail.subject || this.#workspace.t('ui.ws.mail.no_subject'),
					description: `${mail.fromName} <${mail.from}>\n\n${mail.body}`,
					status: 'todo',
					priority: 'medium',
					assigneeIds: me ? [me] : [],
					dueDate: null,
					labels: ['Mail'],
					order: 0,
					contactId: this.contactFor(mail)?.id ?? null,
					checklist: [],
				}),
			{ success: 'ui.ws.mail.task_created' },
		);
		return task;
	}
}
