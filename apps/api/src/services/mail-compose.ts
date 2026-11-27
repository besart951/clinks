import type { MailSendInput, MailSendResult, OwnSenderView } from '@clinks/contracts/mail';
import type { Tx } from '@clinks/db/scope';
import { roleGrants } from '@clinks/domain/permissions';
import { fillPlaceholders } from '@clinks/domain/placeholders';
import type { Contact } from '@clinks/domain/types';
import { blocksFromText } from '@clinks/mail-layout/layout';
import { sql } from 'kysely';
import { ApiError } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import type { Sender } from './mail-senders.ts';
import { enqueueMail } from './outbox.ts';
import { activeRole, withPermission, type MemberScope } from './permissions.ts';

/**
 * The mail module's «Senden»: each recipient gets a mail of their own, with the placeholders filled for them, from
 * the caller's personal sender or a business sender their role may use. Filed under Mail › Gesendet with its delivery.
 */
export class MailComposeService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	/** The senders the caller may pick: their own, and the business senders when their role allows. */
	senders(claims: AccessClaims): Promise<OwnSenderView[]> {
		return withPermission(this.#services.db, claims, 'mail.write', async (tx, scope) => {
			const business = await this.#mayUseBusiness(tx, scope);
			const rows = await tx
				.selectFrom('mailSenders')
				.innerJoin('mailDomains', 'mailDomains.id', 'mailSenders.domainId')
				.select([
					'mailSenders.id',
					'mailSenders.kind',
					'mailSenders.address',
					'mailSenders.displayName',
					'mailDomains.status',
				])
				.where((eb) =>
					eb.or([
						eb('mailSenders.userId', '=', scope.userId),
						...(business ? [eb('mailSenders.kind', '=', 'business')] : []),
					]),
				)
				.orderBy('mailSenders.kind', 'desc')
				.execute();
			return rows.map((row) => ({
				id: row.id,
				kind: row.kind as OwnSenderView['kind'],
				address: row.address,
				displayName: row.displayName,
				active: !!this.#services.relay && row.status === 'verified',
			}));
		});
	}

	send(claims: AccessClaims, input: MailSendInput, caller: Caller): Promise<MailSendResult> {
		return withPermission(this.#services.db, claims, 'mail.write', async (tx, scope) => {
			await this.#withinLimit(tx, scope.tenantId, input.to.length);
			const sender = await this.#sender(tx, scope, input.senderId);
			const attachments = await this.#attachments(tx, input.attachmentIds);
			const headers = await this.#threading(tx, input.replyToId);
			const tenant = await tx
				.selectFrom('tenants')
				.select('name')
				.where('id', '=', scope.tenantId)
				.executeTakeFirstOrThrow();
			const suppressed: string[] = [];
			for (const to of input.to) {
				const contact = await contactByAddress(tx, to);
				const queued = await enqueueMail(tx, scope.tenantId, {
					kind: 'personal',
					to,
					subject: fillPlaceholders(input.subject, contact, tenant.name),
					content: { blocks: blocksFromText(fillPlaceholders(input.body, contact, tenant.name)) },
					...sender,
					attachments,
					headers,
					contactId: contact?.id ?? null,
					file: true,
				});
				if (queued.suppressed) suppressed.push(to);
			}
			if (input.draftId)
				await tx.deleteFrom('mails').where('id', '=', input.draftId).where('folder', '=', 'drafts').execute();
			await audit(
				tx,
				{
					action: 'mail.sent',
					actorId: scope.userId,
					tenantId: scope.tenantId,
					meta: { recipients: input.to.length, suppressed: suppressed.length },
				},
				caller,
			);
			return { queued: input.to.length - suppressed.length, suppressed };
		});
	}

	/**
	 * Mails from the mail module in the last day, across the workspace, against `MAIL_DAILY_LIMIT`. The lock makes
	 * parallel sends of one workspace count one after another instead of all passing on the same count.
	 */
	async #withinLimit(tx: Tx, tenantId: string, adding: number) {
		await sql`select pg_advisory_xact_lock(hashtext(${`mail-limit:${tenantId}`}))`.execute(tx);
		const limit = this.#services.config.MAIL_DAILY_LIMIT ?? 500;
		const { count } = await tx
			.selectFrom('mailOutbox')
			.select((eb) => eb.fn.countAll<string>().as('count'))
			.where('kind', '=', 'personal')
			.where('createdAt', '>=', sql<Date>`now() - interval '1 day'`)
			.executeTakeFirstOrThrow();
		if (Number(count) + adding > limit) throw new ApiError(429, 'error.ws.mail_limit');
	}

	/**
	 * The sender: a chosen one the caller may use, else their personal sender, else the platform address with their
	 * name and their address for replies. The personal signature comes from the profile.
	 */
	async #sender(tx: Tx, scope: MemberScope, senderId: string | null) {
		const me = await tx
			.selectFrom('users')
			.select(['email', 'firstName', 'lastName', 'mailSignature'])
			.where('id', '=', scope.userId)
			.executeTakeFirstOrThrow();
		const query = tx
			.selectFrom('mailSenders')
			.select(['id', 'kind', 'userId', 'displayName', 'address', 'replyTo', 'signature']);
		const chosen = senderId
			? await query.where('id', '=', senderId).executeTakeFirst()
			: await query.where('userId', '=', scope.userId).executeTakeFirst();
		if (senderId && !chosen) throw new ApiError(404, 'error.ws.not_found');
		if (chosen?.kind === 'newsletter') throw new ApiError(403, 'error.ws.mail_sender_forbidden');
		if (chosen?.kind === 'personal' && chosen.userId !== scope.userId)
			throw new ApiError(403, 'error.ws.mail_sender_forbidden');
		if (chosen?.kind === 'business' && !(await this.#mayUseBusiness(tx, scope)))
			throw new ApiError(403, 'error.ws.mail_sender_forbidden');
		if (!chosen)
			return { fromName: `${me.firstName} ${me.lastName}`.trim() || me.email, replyTo: me.email, sender: null };
		const sender: Sender = {
			id: chosen.id,
			displayName: chosen.displayName,
			address: chosen.address,
			replyTo: chosen.replyTo,
			signature: chosen.kind === 'personal' ? me.mailSignature : chosen.signature,
		};
		return { sender };
	}

	async #mayUseBusiness(tx: Tx, scope: MemberScope) {
		return roleGrants(await activeRole(tx, scope.tenantId, scope.userId), 'mail.business');
	}

	async #attachments(tx: Tx, ids: string[]) {
		if (ids.length === 0) return [];
		const documents = await tx
			.selectFrom('documents')
			.select(['id', 'name', 'mimeType'])
			.where('id', 'in', ids)
			.execute();
		if (documents.length !== new Set(ids).size) throw new ApiError(400, 'error.ws.mail_attachment_invalid');
		return documents.map((doc) => ({
			documentId: String(doc.id),
			filename: String(doc.name),
			contentType: String(doc.mimeType),
		}));
	}

	/** A reply carries In-Reply-To and References of the mail it answers, so mail apps keep the thread. */
	async #threading(tx: Tx, replyToId: string | null): Promise<Record<string, string>> {
		if (!replyToId) return {};
		const original = await tx.selectFrom('mails').select('messageId').where('id', '=', replyToId).executeTakeFirst();
		const messageId = original?.messageId ? String(original.messageId) : null;
		return messageId ? { 'In-Reply-To': messageId, References: messageId } : {};
	}
}

/** The contact a recipient address belongs to, for the placeholders and to file the mail at them. */
async function contactByAddress(tx: Tx, address: string) {
	const row = await tx
		.selectFrom('contacts')
		.select(['id', 'kind', 'firstName', 'lastName', 'companyName'])
		.where((eb) => eb(eb.fn('lower', ['email']), '=', address.toLowerCase()))
		.executeTakeFirst();
	// Contact columns are untyped in the schema, as in bank-imports and invoice-archive.
	return row ? (row as unknown as Pick<Contact, 'id' | 'kind' | 'firstName' | 'lastName' | 'companyName'>) : null;
}
