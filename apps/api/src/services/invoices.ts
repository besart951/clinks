import { inScope, type Tx } from '@clinks/db/scope';
import type { InvoiceLinkDetails, InvoiceLinkFile, InvoiceSendInput } from '@clinks/contracts/finance';
import { createHash } from 'node:crypto';
import { linkAttempts, samePostcode, type DeliveryMethod, type InvoiceSettings } from '@clinks/domain/invoicing';
import type { InvoiceSend } from '@clinks/domain/types';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import { uuid } from '../crypto.ts';
import { ApiError, forbidden } from '../errors.ts';
import { translate } from '../i18n.ts';
import { enforceRateLimit } from '../rate-limit.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { documentBytes, documentUrl } from './files.ts';
import { findLink, issueLink, lifetimes } from './one-time.ts';
import { requirePermission } from './permissions.ts';

type Scope = { tenantId: string; userId: string };
type Locale = 'de-CH' | 'en-US';

/** One mail to send: the invoice itself, or a reminder with its own archived PDF (phase 4). */
export interface Delivery {
	invoiceId: string;
	kind: 'invoice' | 'reminder';
	level: number | null;
	documentId: string;
	to: string;
	method: DeliveryMethod;
}

/** Invoices beyond sync: the archived PDF, sending by e-mail and the secure link the recipient opens. */
export class InvoiceService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	/** Where the archived PDF/A of an issued invoice can be downloaded; for anyone who may read finance. */
	pdf(claims: AccessClaims, invoiceId: string) {
		return this.#scoped(claims, 'finance.read', async (tx) => {
			const invoice = await tx
				.selectFrom('invoices')
				.select('documentId')
				.where('id', '=', invoiceId)
				.executeTakeFirst();
			if (!invoice?.documentId) throw new ApiError(404, 'error.ws.not_found');
			return { url: await documentUrl(tx, this.#services, String(invoice.documentId)) };
		});
	}

	/** Sends the archived PDF of an issued invoice, attached or as a secure link. */
	send(claims: AccessClaims, invoiceId: string, input: InvoiceSendInput, caller: Caller) {
		return this.#scoped(claims, 'finance.write', async (tx, scope) => {
			const invoice = await tx
				.selectFrom('invoices')
				.select(['status', 'documentId'])
				.where('id', '=', invoiceId)
				.executeTakeFirst();
			if (!invoice) throw new ApiError(404, 'error.ws.not_found');
			if (invoice.status === 'draft' || invoice.status === 'cancelled' || !invoice.documentId)
				throw new ApiError(400, 'error.ws.invoice_not_issued');
			return this.deliver(
				tx,
				scope,
				{
					invoiceId,
					kind: 'invoice',
					level: null,
					documentId: String(invoice.documentId),
					to: input.to,
					method: input.method,
				},
				caller,
			);
		});
	}

	/** The mails sent for an invoice, newest first. */
	sends(claims: AccessClaims, invoiceId: string) {
		return this.#scoped(claims, 'finance.read', (tx) => this.#sends(tx, invoiceId));
	}

	/**
	 * Logs and sends one mail. The mail goes out inside the transaction: if the mail server refuses it, nothing is
	 * logged. With a link, the mail names no amount and no service, only who sent it and the invoice number.
	 */
	async deliver(tx: Tx, scope: Scope, delivery: Delivery, caller: Caller): Promise<InvoiceSend> {
		const context = await this.#context(tx, scope, delivery.invoiceId);
		const now = this.#services.now();
		const id = uuid();
		if (delivery.method === 'link' && !context.postcode) throw new ApiError(400, 'error.ws.invoice_link_no_postcode');
		const expiresAt = delivery.method === 'link' ? new Date(now.getTime() + lifetimes.invoice_link) : null;
		const bytes =
			delivery.method === 'attachment' ? await documentBytes(tx, this.#services, delivery.documentId) : null;
		if (bytes && delivery.kind === 'invoice' && context.sha256 && sha256(bytes) !== context.sha256)
			throw new ApiError(409, 'error.ws.invoice_archive_mismatch');
		await tx
			.insertInto('invoiceSends')
			.values({
				id,
				tenantId: scope.tenantId,
				invoiceId: delivery.invoiceId,
				kind: delivery.kind,
				level: delivery.level,
				documentId: delivery.documentId,
				recipient: delivery.to,
				method: delivery.method,
				sentAt: now,
				sentBy: scope.userId,
				linkExpiresAt: expiresAt,
			})
			.execute();
		const link = expiresAt
			? await issueLink(tx, { purpose: 'invoice_link', tenantId: scope.tenantId, invoiceSendId: id, now })
			: null;
		const t = (key: ProductTranslationKey, params?: { [name: string]: string | number }) =>
			translate(context.locale, key, params);
		const params = {
			tenant: context.tenantName,
			number: context.number,
			level: delivery.level ?? 0,
			due: formatDate(context.dueDate, context.locale),
		};
		const subject = t(delivery.kind === 'invoice' ? 'mail.invoice.subject' : 'mail.invoice.reminder_subject', params);
		const text = link
			? t('mail.invoice.body_link', {
					...params,
					link: `${this.#services.config.WEB_ORIGIN}/#/invoice-link/${encodeURIComponent(link.token)}`,
					expires: formatDate(expiresAt!.toISOString().slice(0, 10), context.locale),
				})
			: t(delivery.kind === 'invoice' ? 'mail.invoice.body_attachment' : 'mail.invoice.reminder_body', params);
		await this.#services.mailer.send({
			to: delivery.to,
			subject,
			text,
			fromName: context.tenantName,
			replyTo: context.replyTo,
			attachments: bytes
				? [{ filename: context.fileName(delivery.documentId), content: bytes, contentType: 'application/pdf' }]
				: undefined,
		});
		await audit(
			tx,
			{
				action: delivery.kind === 'invoice' ? 'invoice.sent' : 'invoice.reminder_sent',
				actorId: scope.userId,
				tenantId: scope.tenantId,
				target: delivery.invoiceId,
				meta: { method: delivery.method, level: delivery.level },
			},
			caller,
		);
		const [send] = (await this.#sends(tx, delivery.invoiceId)).filter((row) => row.id === id);
		return send;
	}

	/** What the link shows before the postcode; the workspace's name and the invoice number only. */
	async linkDetails(token: string): Promise<InvoiceLinkDetails> {
		const link = await this.#link(token);
		return inScope(this.#services.db, { tenantId: link.tenantId, userId: null }, async (tx) => {
			const row = await this.#linkRow(tx, link.sendId);
			return {
				tenantName: row.tenantName,
				number: row.number,
				kind: row.kind,
				level: row.level,
				expiresAt: link.expiresAt.toISOString(),
			};
		});
	}

	/**
	 * Opens the file behind a secure link once the postcode of the billing address matches. Five wrong postcodes
	 * end the link; the workspace then sends a new one. Each opening is counted on the send log.
	 */
	async openLink(token: string, postcode: string, caller: Caller): Promise<InvoiceLinkFile> {
		enforceRateLimit(this.#services.limiter, `invoice-link:${caller.ip ?? 'unknown'}`, 20);
		const link = await this.#link(token);
		if (link.attempts >= linkAttempts) throw new ApiError(410, 'error.ws.invoice_link_locked');
		const opened = await inScope(this.#services.db, { tenantId: link.tenantId, userId: null }, async (tx) => {
			const row = await this.#linkRow(tx, link.sendId);
			if (!samePostcode(postcode, row.postcode)) {
				// Counted in this transaction, which commits: the refusal is thrown after it.
				await tx
					.updateTable('auth.oneTimeTokens')
					.set((eb) => ({ attempts: eb('attempts', '+', 1) }))
					.where('id', '=', link.id)
					.execute();
				return null;
			}
			const now = this.#services.now();
			await tx
				.updateTable('invoiceSends')
				.set((eb) => ({ openedAt: eb.fn.coalesce('openedAt', eb.val(now)), openCount: eb('openCount', '+', 1) }))
				.where('id', '=', link.sendId)
				.execute();
			await audit(
				tx,
				{
					action: 'invoice.link_opened',
					actorId: null,
					tenantId: link.tenantId,
					target: row.invoiceId,
					meta: { send: link.sendId },
				},
				caller,
			);
			return { name: row.fileName, url: await documentUrl(tx, this.#services, row.documentId) };
		});
		if (opened) return opened;
		throw new ApiError(
			400,
			link.attempts + 1 >= linkAttempts ? 'error.ws.invoice_link_locked' : 'error.ws.invoice_link_postcode',
		);
	}

	async #link(token: string) {
		const row = await findLink(this.#services.db, 'invoice_link', token, this.#services.now());
		if (!row?.tenantId || !row.invoiceSendId) throw new ApiError(404, 'error.ws.invoice_link_invalid');
		return {
			id: row.id,
			tenantId: row.tenantId,
			sendId: row.invoiceSendId,
			attempts: row.attempts,
			expiresAt: row.expiresAt,
		};
	}

	async #linkRow(tx: Tx, sendId: string) {
		const row = await tx
			.selectFrom('invoiceSends')
			.innerJoin('invoices', 'invoices.id', 'invoiceSends.invoiceId')
			.innerJoin('tenants', 'tenants.id', 'invoiceSends.tenantId')
			.innerJoin('documents', 'documents.id', 'invoiceSends.documentId')
			.leftJoin('contacts', 'contacts.id', 'invoices.contactId')
			.select([
				'invoiceSends.invoiceId',
				'invoiceSends.kind',
				'invoiceSends.level',
				'invoiceSends.documentId',
				'invoices.number',
				'tenants.name as tenantName',
				'documents.name as fileName',
				'contacts.address',
			])
			.where('invoiceSends.id', '=', sendId)
			.executeTakeFirst();
		if (!row) throw new ApiError(404, 'error.ws.invoice_link_invalid');
		return {
			invoiceId: row.invoiceId,
			kind: row.kind,
			level: row.level,
			documentId: row.documentId,
			number: String(row.number),
			tenantName: row.tenantName,
			fileName: String(row.fileName),
			postcode: (row.address as { zip?: string } | null)?.zip ?? '',
		};
	}

	async #context(tx: Tx, scope: Scope, invoiceId: string) {
		const invoice = await tx
			.selectFrom('invoices')
			.leftJoin('contacts', 'contacts.id', 'invoices.contactId')
			.select(['invoices.number', 'invoices.dueDate', 'invoices.pdfSha256', 'contacts.address'])
			.where('invoices.id', '=', invoiceId)
			.executeTakeFirst();
		if (!invoice) throw new ApiError(404, 'error.ws.not_found');
		const tenant = await tx
			.selectFrom('tenants')
			.select(['name', 'locale', 'invoiceSettings'])
			.where('id', '=', scope.tenantId)
			.executeTakeFirstOrThrow();
		const sender = await tx.selectFrom('users').select('email').where('id', '=', scope.userId).executeTakeFirst();
		const settings = tenant.invoiceSettings as InvoiceSettings;
		const files = new Map<string, string>();
		const documents = await tx
			.selectFrom('documents')
			.select(['id', 'name'])
			.where('targets', '@>', JSON.stringify([{ kind: 'invoice', id: invoiceId }]))
			.execute();
		for (const doc of documents) files.set(String(doc.id), String(doc.name));
		return {
			locale: (tenant.locale === 'en-US' ? 'en-US' : 'de-CH') as Locale,
			tenantName: tenant.name,
			number: String(invoice.number),
			dueDate: String(invoice.dueDate),
			sha256: invoice.pdfSha256 ? String(invoice.pdfSha256) : null,
			postcode: (invoice.address as { zip?: string } | null)?.zip?.trim() ?? '',
			replyTo: settings.replyTo || sender?.email || undefined,
			fileName: (documentId: string) => files.get(documentId) ?? `${String(invoice.number)}.pdf`,
		};
	}

	async #sends(tx: Tx, invoiceId: string): Promise<InvoiceSend[]> {
		const rows = await tx
			.selectFrom('invoiceSends')
			.leftJoin('users', 'users.id', 'invoiceSends.sentBy')
			.selectAll('invoiceSends')
			.select(['users.firstName', 'users.lastName', 'users.email'])
			.where('invoiceSends.invoiceId', '=', invoiceId)
			.orderBy('invoiceSends.sentAt', 'desc')
			.execute();
		return rows.map((row) => ({
			id: row.id,
			tenantId: row.tenantId,
			invoiceId: row.invoiceId,
			kind: row.kind,
			level: row.level,
			documentId: row.documentId,
			recipient: row.recipient,
			method: row.method,
			sentAt: row.sentAt.toISOString(),
			sentBy: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || (row.email ?? ''),
			linkExpiresAt: row.linkExpiresAt?.toISOString() ?? null,
			openedAt: row.openedAt?.toISOString() ?? null,
			openCount: row.openCount,
		})) as InvoiceSend[];
	}

	#scoped<T>(
		claims: AccessClaims,
		permission: 'finance.read' | 'finance.write',
		work: (tx: Tx, scope: Scope) => Promise<T>,
	) {
		if (!claims.tenant_id) throw forbidden();
		const scope = { tenantId: claims.tenant_id, userId: claims.sub };
		return inScope(this.#services.db, scope, async (tx) => {
			await requirePermission(tx, scope.tenantId, scope.userId, permission);
			return work(tx, scope);
		});
	}
}

function sha256(bytes: Uint8Array) {
	return createHash('sha256').update(bytes).digest('hex');
}

/** A calendar date as the recipient reads it: 31.12.2026 or 12/31/2026. */
function formatDate(date: string, locale: Locale) {
	const [year, month, day] = date.split('-');
	return locale === 'en-US' ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
}
