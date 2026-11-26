import { createHash } from 'node:crypto';
import type { Tx } from '@clinks/db/scope';
import { nodeAssets } from '@clinks/invoice-pdf/node-assets';
import { renderInvoicePdf, type InvoicePdfInput, type PdfReminder } from '@clinks/invoice-pdf/render';
import { contactName } from '@clinks/domain/contacts';
import type { Address, Contact, Invoice, Tenant } from '@clinks/domain/types';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import { uuid } from '../crypto.ts';
import { translate } from '../i18n.ts';
import type { Services } from './context.ts';
import { storeServerFile } from './files.ts';

type Scope = { tenantId: string; userId: string };

/** Name of the folder the archived invoices and reminders go into, per workspace language. */
const folderName = { 'de-CH': 'Rechnungen', 'en-US': 'Invoices' } as const;

/**
 * Renders invoices and reminders as PDF/A and archives them once, locked, in the workspace's bucket
 * (Art. 958f OR, Art. 9 GeBüV). The invoice keeps the document and its SHA-256.
 */
export class InvoiceArchive {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	/** Archives the PDF of an invoice that was just issued; nothing happens when it already has one. */
	async issue(tx: Tx, scope: Scope, invoiceId: string) {
		const input = await this.#input(tx, scope.tenantId, invoiceId);
		if (!input || input.invoice.documentId) return;
		const bytes = await renderInvoicePdf(input.pdf, await nodeAssets());
		const name = `${input.pdf.t('ui.ws.invoice.invoice')} ${input.invoice.number}.pdf`;
		const documentId = await this.#store(tx, scope, input.locale, invoiceId, name, bytes);
		await tx
			.updateTable('invoices')
			.set((eb) => ({
				documentId,
				pdfSha256: sha256(bytes),
				revision: eb('revision', '+', 1),
				updatedAt: this.#services.now(),
			}))
			.where('id', '=', invoiceId)
			.execute();
	}

	/** Renders and archives a reminder; returns the document and its bytes for sending. */
	async reminder(tx: Tx, scope: Scope, invoiceId: string, reminder: PdfReminder) {
		const input = await this.#input(tx, scope.tenantId, invoiceId);
		if (!input) return null;
		const bytes = await renderInvoicePdf({ ...input.pdf, reminder }, await nodeAssets());
		const name = `${input.pdf.t('ui.ws.pdf.reminder', { level: reminder.level })} ${input.invoice.number}.pdf`;
		const documentId = await this.#store(tx, scope, input.locale, invoiceId, name, bytes);
		return { documentId, bytes, name, sha256: sha256(bytes) };
	}

	async #input(tx: Tx, tenantId: string, invoiceId: string) {
		const row = await tx.selectFrom('invoices').selectAll().where('id', '=', invoiceId).executeTakeFirst();
		if (!row || row.status === 'draft') return null;
		const invoice = row as unknown as Invoice & { contactId: string };
		const tenant = (await tx
			.selectFrom('tenants')
			.selectAll()
			.where('id', '=', tenantId)
			.executeTakeFirstOrThrow()) as unknown as Tenant;
		const contact = await tx
			.selectFrom('contacts')
			.select(['firstName', 'lastName', 'companyName', 'kind', 'address'])
			.where('id', '=', invoice.contactId)
			.executeTakeFirst();
		const locale: 'de-CH' | 'en-US' = tenant.locale === 'en-US' ? 'en-US' : 'de-CH';
		const pdf: InvoicePdfInput = {
			tenant,
			recipient: contact
				? { name: contactName(contact as unknown as Contact), address: contact.address as Address }
				: null,
			// `date` columns arrive as text (see @clinks/db client), as the PDF wants them.
			invoice,
			locale,
			t: (key, params) => translate(locale, key as ProductTranslationKey, params),
			now: this.#services.now(),
		};
		return { invoice, pdf, locale };
	}

	async #store(tx: Tx, scope: Scope, locale: 'de-CH' | 'en-US', invoiceId: string, name: string, bytes: Uint8Array) {
		const documentId = uuid();
		const type = 'application/pdf';
		const dataUrl = await storeServerFile(tx, this.#services, scope, documentId, bytes, type);
		await tx
			.insertInto('documents')
			.values({
				id: documentId,
				tenantId: scope.tenantId,
				name,
				folderId: await this.#folder(tx, scope.tenantId, folderName[locale]),
				mimeType: type,
				size: bytes.length,
				dataUrl,
				targets: JSON.stringify([{ kind: 'invoice', id: invoiceId }]),
				uploadedBy: scope.userId,
				locked: true,
			})
			.execute();
		return documentId;
	}

	async #folder(tx: Tx, tenantId: string, name: string) {
		const existing = await tx
			.selectFrom('folders')
			.select('id')
			.where('name', '=', name)
			.where('parentId', 'is', null)
			.executeTakeFirst();
		if (existing) return existing.id as string;
		const id = uuid();
		await tx.insertInto('folders').values({ id, tenantId, name, parentId: null }).execute();
		return id;
	}
}

function sha256(bytes: Uint8Array) {
	return createHash('sha256').update(bytes).digest('hex');
}
