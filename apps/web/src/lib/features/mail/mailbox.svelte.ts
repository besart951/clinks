import type { MailId } from '@clinks/domain/ids';
import type { Contact, MailFolder, MailMessage, MailTemplate } from '@clinks/domain/types';
import { threadKey, threads, waiting, type MailThread } from '@clinks/domain/mail-threads';
import { emptyQuery, matchesMailQuery, parseMailQuery } from '@clinks/domain/mail-query';

/** A folder, or «Zurückgestellt»: the snoozed mails of every folder until their time comes. */
export type MailView = MailFolder | 'snoozed';
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
	folder = $state<MailView>('inbox');
	/** The clock snoozed mails are measured against; `tick` moves it, so they come back while the page is open. */
	now = $state(new Date());
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

	/** The folder's conversations, newest first; the search finds a conversation by any of its mails. */
	readonly threads: MailThread[] = $derived.by(() => {
		const query = parseMailQuery(this.search);
		const mails = (this.resource.data?.mails ?? []).filter((mail) => this.#inView(mail));
		return threads(mails).filter(
			(thread) => emptyQuery(query) || thread.mails.some((mail) => matchesMailQuery(mail, query)),
		);
	});
	/** Each conversation by the id of its newest mail, which stands for it in the list. */
	readonly #byLatest = $derived(new Map(this.threads.map((thread) => [thread.latest.id, thread])));

	/** One entry per conversation: its newest mail. */
	get messages(): MailMessage[] {
		return this.threads.map((thread) => thread.latest);
	}

	/** The folder's conversation that `mail` stands for in the list. */
	threadFor(mail: MailMessage): MailThread | null {
		return this.#byLatest.get(mail.id) ?? null;
	}

	/** The mails of that conversation; just the mail when it stands alone. */
	threadOf(mail: MailMessage): MailMessage[] {
		return this.threadFor(mail)?.mails ?? [mail];
	}

	/** The whole conversation for the reading pane, across folders (received, sent, archived), oldest first. */
	conversation(mail: MailMessage): MailMessage[] {
		if (mail.folder === 'drafts') return [mail];
		const key = threadKey(mail);
		return (this.resource.data?.mails ?? [])
			.filter((candidate) => candidate.folder !== 'drafts' && threadKey(candidate) === key)
			.sort((left, right) => left.sentAt.localeCompare(right.sentAt));
	}

	get selected(): MailMessage | null {
		return this.resource.data?.mails.find((mail) => mail.id === this.selectedId) ?? null;
	}

	unread(view: MailView) {
		return (this.resource.data?.mails ?? []).filter((mail) => this.#inView(mail, view) && !mail.read).length;
	}

	count(view: MailView) {
		return (this.resource.data?.mails ?? []).filter((mail) => this.#inView(mail, view)).length;
	}

	tick() {
		this.now = new Date();
	}

	/** Snoozed mails wait under «Zurückgestellt», out of their folder; drafts are never snoozed. */
	#inView(mail: MailMessage, view: MailView = this.folder) {
		const snoozed = waiting(mail, this.now);
		return view === 'snoozed' ? snoozed && mail.folder !== 'drafts' : mail.folder === view && !snoozed;
	}

	contactFor(mail: MailMessage): Contact | null {
		const contacts = this.resource.data?.contacts ?? [];
		return (
			contacts.find((contact) => contact.id === mail.contactId) ??
			contacts.find((contact) => contact.email && (contact.email === mail.from || mail.to.includes(contact.email))) ??
			null
		);
	}

	/** Opens a conversation and marks its unread mails read. */
	async select(mail: MailMessage) {
		this.selectedId = mail.id;
		const unread = this.threadOf(mail).filter((row) => !row.read);
		if (unread.length === 0 || !this.#workspace.session.can('mail.write')) return;
		const ids = new Set(unread.map((row) => row.id));
		this.resource.patch((data) => ({
			...data,
			mails: data.mails.map((row) => (ids.has(row.id) ? { ...row, read: true } : row)),
		}));
		for (const row of unread)
			await this.#workspace.api.mails.update(row.id, row.revision, { read: true }).catch(() => undefined);
	}

	async setStar(mails: MailMessage[], starred: boolean) {
		await this.#update(mails, { starred });
	}

	async setRead(mails: MailMessage[], read: boolean) {
		await this.#update(mails, { read });
		if (!read && mails.some((mail) => mail.id === this.selectedId)) this.selectedId = null;
	}

	/** «Später erinnern» until then; null brings them back now. */
	async snooze(mails: MailMessage[], until: Date | null) {
		if (mails.some((mail) => mail.id === this.selectedId)) this.selectedId = null;
		await this.#update(
			mails,
			{ snoozedUntil: until?.toISOString() ?? null },
			until
				? {
						success: 'ui.ws.mail.snoozed',
						successParams: { when: this.#workspace.i18n.dateTime(until.toISOString()) },
						undo: true,
					}
				: { success: 'ui.ws.mail.unsnoozed' },
		);
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
		patch: Partial<Pick<MailMessage, 'read' | 'starred' | 'folder' | 'snoozedUntil'>>,
		toast: Pick<RunOptions, 'success' | 'successParams'> & { undo?: boolean } = {},
	) {
		const api = this.#workspace.api.mails;
		const changed = mails.filter((mail) =>
			(Object.keys(patch) as (keyof typeof patch)[]).some((key) => (mail[key] ?? null) !== patch[key]),
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
									(Object.keys(patch) as (keyof typeof patch)[]).map((key) => [key, mail[key] ?? null]),
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
