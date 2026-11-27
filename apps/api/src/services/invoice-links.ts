import { inScope, type Tx } from '@clinks/db/scope';
import type { InvoiceLinkDetails, InvoiceLinkFile } from '@clinks/contracts/finance';
import { linkAttempts, samePostcode } from '@clinks/domain/invoicing';
import { ApiError } from '../errors.ts';
import { enforceRateLimit } from '../rate-limit.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { documentUrl } from './files.ts';
import { findLink } from './one-time.ts';

/**
 * The recipient's side of a secure invoice link: no account, only the token from the mail and the postcode of the
 * billing address. Five wrong postcodes end the link; each opening is counted on the send log.
 */
export class InvoiceLinks {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	/** What the link shows before the postcode; the workspace's name and the invoice number only. */
	async details(token: string): Promise<InvoiceLinkDetails> {
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
	async open(token: string, postcode: string, caller: Caller): Promise<InvoiceLinkFile> {
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
}
