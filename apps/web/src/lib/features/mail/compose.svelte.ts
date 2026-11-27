import { toast } from 'svelte-sonner';
import type { OwnSenderView } from '@clinks/contracts/mail';
import { placeholders } from '@clinks/domain/placeholders';
import type { Contact, MailMessage, MailTemplate, StoredDocument } from '@clinks/domain/types';
import type { Workspace } from '../../workspace.svelte.ts';

const placeholderPattern = new RegExp(`\\{(${placeholders.join('|')})\\}`);

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
	/** The senders the caller may use; empty: the platform address in their name. */
	senders = $state.raw<OwnSenderView[]>([]);
	senderId = $state<string | null>(null);
	attachments = $state.raw<StoredDocument[]>([]);
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(JSON.stringify([this.to, this.subject, this.body]) !== this.#initial);
	/** Placeholders are filled per recipient when sending; the form says so while the text has any. */
	usesPlaceholders = $derived(placeholderPattern.test(`${this.subject}\n${this.body}`));

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
		this.attachments = [];
		this.#initial = JSON.stringify([this.to, this.subject, this.body]);
		void this.#loadSenders();
	}

	async #loadSenders() {
		try {
			this.senders = await this.#workspace.mailOutgoing.senders();
		} catch {
			this.senders = [];
		}
		this.senderId = this.senders.find((sender) => sender.kind === 'personal')?.id ?? null;
	}

	attach(document: StoredDocument) {
		if (!this.attachments.some((candidate) => candidate.id === document.id))
			this.attachments = [...this.attachments, document];
	}

	detach(document: StoredDocument) {
		this.attachments = this.attachments.filter((candidate) => candidate.id !== document.id);
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

	/** The template as written: its placeholders stay and are filled for each recipient when sending. */
	applyTemplate(template: MailTemplate) {
		this.subject = template.subject;
		this.body = template.body;
	}

	/** One mail per recipient through the outbox; the draft, if any, is removed by the server. */
	async send(): Promise<boolean> {
		if (this.recipientInput.trim()) this.addRecipient();
		return this.#busy(async () => {
			const result = await this.#workspace.mailOutgoing.send({
				senderId: this.senderId,
				to: [...this.to],
				subject: this.subject,
				body: this.body,
				attachmentIds: this.attachments.map((document) => document.id),
				replyToId: this.replyTo?.id ?? null,
				draftId: this.draft?.id ?? null,
			});
			this.#initial = JSON.stringify([this.to, this.subject, this.body]);
			if (result.queued > 0)
				toast.success(
					result.queued === 1
						? this.#workspace.t('ui.ws.mail.sent')
						: this.#workspace.t('ui.ws.mail.queued', { count: result.queued }),
				);
			if (result.suppressed.length > 0)
				toast.warning(this.#workspace.t('ui.ws.mail.sent_suppressed', { addresses: result.suppressed.join(', ') }));
		});
	}

	/** Drafts stay internal: a row under Entwürfe, synced like any other. */
	async saveDraft(contacts: Contact[]): Promise<boolean> {
		if (this.recipientInput.trim()) this.addRecipient();
		return this.#busy(async () => {
			const user = this.#workspace.session.user!;
			const contact = contacts.find((candidate) => candidate.email && this.to.includes(candidate.email)) ?? null;
			const message = {
				folder: 'drafts' as const,
				from: user.email,
				fromName: `${user.firstName} ${user.lastName}`,
				to: [...this.to],
				subject: this.subject,
				body: this.body,
				sentAt: new Date().toISOString(),
				read: true,
				starred: false,
				contactId: contact?.id ?? this.replyTo?.contactId ?? null,
				messageId: null,
				delivery: null,
			};
			const api = this.#workspace.api.mails;
			if (this.draft) await api.update(this.draft.id, this.draft.revision, message);
			else this.draft = await api.create(message);
			this.draft = await api.get(this.draft.id);
			this.#initial = JSON.stringify([this.to, this.subject, this.body]);
			toast.success(this.#workspace.t('ui.ws.mail.draft_saved'));
		});
	}

	async #busy(work: () => Promise<void>): Promise<boolean> {
		this.busy = true;
		this.fields = {};
		try {
			await work();
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
