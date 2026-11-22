import { toast } from 'svelte-sonner';
import type { Contact, MailMessage, MailTemplate } from '@clinks/domain/types';
import type { Workspace } from '../../workspace.svelte.ts';
import { fillPlaceholders } from './templates.ts';

/** Writing a new message, a reply or continuing a draft. */
export class ComposeModel {
	to = $state<string[]>([]);
	recipientInput = $state('');
	subject = $state('');
	body = $state('');
	busy = $state(false);
	fields = $state<{ [field: string]: string }>({});
	draft = $state.raw<MailMessage | null>(null);
	replyTo = $state.raw<MailMessage | null>(null);
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(JSON.stringify([this.to, this.subject, this.body]) !== this.#initial);

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	start(
		options: {
			to?: string[];
			subject?: string;
			body?: string;
			draft?: MailMessage | null;
			replyTo?: MailMessage | null;
		} = {},
	) {
		const reply = options.replyTo ?? null;
		this.draft = options.draft ?? null;
		this.replyTo = reply;
		this.to = options.draft?.to ?? options.to ?? (reply ? [reply.from] : []);
		this.subject = options.draft?.subject ?? options.subject ?? (reply ? `Re: ${reply.subject}` : '');
		this.body =
			options.draft?.body ??
			options.body ??
			(reply
				? `\n\n${this.#workspace.t('ui.ws.mail.quote_header', { name: reply.fromName, date: this.#workspace.i18n.dateTime(reply.sentAt) })}\n> ${reply.body.split('\n').join('\n> ')}`
				: '');
		this.recipientInput = '';
		this.fields = {};
		this.#initial = JSON.stringify([this.to, this.subject, this.body]);
	}

	addRecipient(value = this.recipientInput) {
		const emails = value
			.split(/[,;\s]+/)
			.map((email) => email.trim())
			.filter(Boolean);
		this.to = [...new Set([...this.to, ...emails])];
		this.recipientInput = '';
	}

	removeRecipient(email: string) {
		this.to = this.to.filter((candidate) => candidate !== email);
	}

	applyTemplate(template: MailTemplate, contacts: Contact[]) {
		const contact = contacts.find((candidate) => candidate.email === this.to[0]) ?? null;
		const company = this.#workspace.session.tenant?.name ?? '';
		this.subject = fillPlaceholders(template.subject, contact, company);
		this.body = fillPlaceholders(template.body, contact, company);
	}

	async send(contacts: Contact[]): Promise<boolean> {
		if (this.recipientInput.trim()) this.addRecipient();
		return this.#persist('sent', contacts);
	}

	async saveDraft(contacts: Contact[]): Promise<boolean> {
		if (this.recipientInput.trim()) this.addRecipient();
		return this.#persist('drafts', contacts);
	}

	async #persist(folder: 'sent' | 'drafts', contacts: Contact[]): Promise<boolean> {
		this.busy = true;
		this.fields = {};
		const user = this.#workspace.session.user!;
		const contact = contacts.find((candidate) => candidate.email && this.to.includes(candidate.email)) ?? null;
		const message = {
			folder,
			from: user.email,
			fromName: `${user.firstName} ${user.lastName}`,
			to: [...this.to],
			subject: this.subject,
			body: this.body,
			sentAt: new Date().toISOString(),
			read: true,
			starred: false,
			contactId: contact?.id ?? this.replyTo?.contactId ?? null,
		};
		const api = this.#workspace.api.mails;
		try {
			if (this.draft) await api.update(this.draft.id, this.draft.revision, message);
			else this.draft = await api.create(message);
			if (folder === 'drafts' && this.draft) this.draft = await api.get(this.draft.id);
			this.#initial = JSON.stringify([this.to, this.subject, this.body]);
			toast.success(this.#workspace.t(folder === 'sent' ? 'ui.ws.mail.sent' : 'ui.ws.mail.draft_saved'));
			return true;
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) toast.error(this.#workspace.message(error));
			return false;
		} finally {
			this.busy = false;
		}
	}
}
