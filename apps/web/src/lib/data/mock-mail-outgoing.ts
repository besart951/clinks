import type { MailSendCancelInput, MailSendInput, MailSendResult, OwnSenderView } from '@clinks/contracts/mail';
import { newId, type MailId } from '@clinks/domain/ids';
import { fillPlaceholders } from '@clinks/domain/placeholders';
import type { MailMessage } from '@clinks/domain/types';
import { stamp, type WorkspaceCache } from './database.ts';
import { allowedCaller, appendAudit, mockError, type RequestContext } from './repository.ts';

/** Like the API's `MAIL_UNDO_SECONDS`: how long a sent mail can still be taken back. */
const undoMs = 10_000;
/** Mails still waiting, by id, until when; across instances, like the server's queue. */
const waiting = new Map<string, number>();

/**
 * The demo's stand-in for «Senden» (apps/api services/mail-compose.ts): the same sender rules and one mail per
 * recipient with its placeholders filled, filed under Gesendet. Nothing leaves the browser, so each is «versendet».
 */
export class MockMailOutgoing {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	senders(): Promise<OwnSenderView[]> {
		return this.#db.request(() => {
			const { tenantId, actorId } = allowedCaller(this.#context, 'mail.write');
			const business = this.#context.can('mail.business');
			return this.#db
				.table('mailSenders')
				.filter((row) => row.tenantId === tenantId && (row.userId === actorId || (business && row.kind === 'business')))
				.sort((left, right) => right.kind.localeCompare(left.kind))
				.map((row) => ({
					id: row.id,
					kind: row.kind as OwnSenderView['kind'],
					address: row.address,
					displayName: row.displayName,
					active: this.#verified(row.domainId),
				}));
		});
	}

	send(input: MailSendInput): Promise<MailSendResult> {
		return this.#db.request(() => {
			const { tenantId, actorId } = allowedCaller(this.#context, 'mail.write');
			const tenant = this.#db.table('tenants').find((row) => row.id === tenantId)!;
			const user = this.#db.table('users').find((row) => row.id === actorId)!;
			const sender = this.#sender(tenantId, actorId, input.senderId);
			const signature = sender?.kind === 'personal' ? user.mailSignature : (sender?.signature ?? '');
			const contacts = this.#db.table('contacts').filter((row) => row.tenantId === tenantId);
			const sentAt = new Date().toISOString();
			const filed: MailId[] = [];
			for (const to of input.to) {
				const contact = contacts.find((row) => row.email.toLowerCase() === to.toLowerCase()) ?? null;
				const body = fillPlaceholders(input.body, contact, tenant.name);
				filed.push(newId<MailId>());
				this.#db.table('mails').push(
					stamp<MailMessage>({
						id: filed.at(-1)!,
						tenantId,
						folder: 'sent',
						from: sender?.address ?? user.email,
						fromName: sender?.displayName ?? `${user.firstName} ${user.lastName}`.trim(),
						to: [to],
						subject: fillPlaceholders(input.subject, contact, tenant.name),
						body: signature ? `${body}\n\n${signature}` : body,
						sentAt,
						read: true,
						starred: false,
						contactId: contact?.id ?? null,
						messageId: null,
						delivery: 'sent',
					}),
				);
			}
			if (input.draftId) {
				const mails = this.#db.table('mails');
				const index = mails.findIndex((row) => row.id === input.draftId && row.folder === 'drafts');
				if (index >= 0) mails.splice(index, 1);
			}
			appendAudit(this.#db, {
				tenantId,
				actorId,
				action: 'mail.sent',
				target: { kind: 'mail', id: filed[0], label: input.subject },
			});
			const until = Date.now() + undoMs;
			for (const id of filed) waiting.set(id, until);
			return { queued: input.to.length, suppressed: [], outboxIds: filed, undoUntil: new Date(until).toISOString() };
		}, ['mails', 'audit']);
	}

	/** «Undo send»: removes the filed mails while they still wait, all or nothing. */
	cancel(input: MailSendCancelInput): Promise<{ cancelled: number }> {
		return this.#db.request(() => {
			const { tenantId, actorId } = allowedCaller(this.#context, 'mail.write');
			if (input.outboxIds.some((id) => (waiting.get(id) ?? 0) <= Date.now()))
				throw mockError(this.#context, 'conflict', 'error.ws.mail_already_sent');
			const mails = this.#db.table('mails');
			const subject = mails.find((row) => row.id === input.outboxIds[0])?.subject ?? '';
			for (const id of input.outboxIds) {
				waiting.delete(id);
				const index = mails.findIndex((row) => row.id === id && row.tenantId === tenantId);
				if (index >= 0) mails.splice(index, 1);
			}
			appendAudit(this.#db, {
				tenantId,
				actorId,
				action: 'mail.cancelled',
				target: { kind: 'mail', id: input.outboxIds[0], label: subject },
			});
			return { cancelled: input.outboxIds.length };
		}, ['mails', 'audit']);
	}

	#sender(tenantId: string, actorId: string, senderId: string | null) {
		const senders = this.#db.table('mailSenders').filter((row) => row.tenantId === tenantId);
		const chosen = senderId
			? senders.find((row) => row.id === senderId)
			: senders.find((row) => row.userId === actorId);
		if (senderId && !chosen) throw mockError(this.#context, 'not_found', 'error.ws.not_found');
		if (!chosen) return null;
		const allowed =
			chosen.kind === 'personal'
				? chosen.userId === actorId
				: chosen.kind === 'business' && this.#context.can('mail.business');
		if (!allowed) throw mockError(this.#context, 'forbidden', 'error.ws.mail_sender_forbidden');
		return chosen;
	}

	#verified(domainId: string) {
		return this.#db.table('mailDomains').some((row) => row.id === domainId && row.status === 'verified');
	}
}
