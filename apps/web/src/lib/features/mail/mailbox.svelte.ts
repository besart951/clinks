import type { MailId } from '@clinks/domain/ids';
import type { Contact, MailFolder, MailMessage, MailTemplate } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { RunOptions, Workspace } from '../../workspace.svelte.ts';

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

	async setStar(mails: MailMessage[], starred: boolean) {
		await this.#update(mails, { starred });
	}

	async setRead(mails: MailMessage[], read: boolean) {
		await this.#update(mails, { read });
		if (!read && mails.some((mail) => mail.id === this.selectedId)) this.selectedId = null;
	}

	async moveTo(mails: MailMessage[], folder: MailFolder) {
		if (mails.some((mail) => mail.id === this.selectedId)) this.selectedId = null;
		await this.#update(
			mails,
			{ folder },
			{
				success: mails.length > 1 ? 'ui.ws.mail.moved_many' : 'ui.ws.mail.moved',
				successParams: { folder: this.#workspace.t(`ui.ws.mail.folder.${folder}`), count: mails.length },
				undo: true,
			},
		);
	}

	async remove(mails: MailMessage[]) {
		const api = this.#workspace.api.mails;
		if (mails.some((mail) => mail.id === this.selectedId)) this.selectedId = null;
		await this.#workspace.run(
			async () => {
				for (const mail of mails) await api.remove(mail.id);
			},
			{
				success: mails.length > 1 ? 'ui.ws.mail.deleted_many' : 'ui.ws.mail.deleted',
				successParams: { count: mails.length },
				undo: async () => {
					for (const mail of mails) await api.restore(mail);
				},
			},
		);
	}

	/**
	 * Changes several mails at once. With `undo`, the toast offers to set the changed fields back to what each
	 * mail had before.
	 */
	async #update(
		mails: MailMessage[],
		patch: Partial<Pick<MailMessage, 'read' | 'starred' | 'folder'>>,
		toast: Pick<RunOptions, 'success' | 'successParams'> & { undo?: boolean } = {},
	) {
		const api = this.#workspace.api.mails;
		const changed = mails.filter((mail) =>
			(Object.keys(patch) as (keyof typeof patch)[]).some((key) => mail[key] !== patch[key]),
		);
		if (changed.length === 0) return;
		await this.#workspace.run(
			async () => {
				for (const mail of changed) await api.update(mail.id, mail.revision, patch);
			},
			{
				success: toast.success,
				successParams: toast.successParams,
				undo: toast.undo
					? async () => {
							for (const mail of changed) {
								const current = await api.get(mail.id);
								const before = Object.fromEntries(
									(Object.keys(patch) as (keyof typeof patch)[]).map((key) => [key, mail[key]]),
								);
								await api.update(current.id, current.revision, before);
							}
						}
					: undefined,
			},
		);
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
