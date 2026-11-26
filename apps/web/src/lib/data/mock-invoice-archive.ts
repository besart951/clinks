import { bundleFor, interpolate, type Locale } from '@clinks/i18n-types/catalog';
import { newId, type DocumentId, type FolderId } from '@clinks/domain/ids';
import type { Folder, Invoice, StoredDocument } from '@clinks/domain/types';
import type { PdfReminder } from '@clinks/invoice-pdf/render';
import { contactName } from '@clinks/domain/contacts';
import { stamp, type WorkspaceCache } from './database.ts';
import type { RequestContext } from './repository.ts';

/**
 * The demo backend's stand-in for the API's invoice archive (apps/api invoice-archive.ts): an issued invoice gets
 * its PDF/A as a locked document in «Rechnungen», with the SHA-256 on the invoice.
 */
export class MockInvoiceArchive {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	/** Runs inside the write; the PDF is made right after, as the server makes it in the same transaction. */
	invoiceChanged(before: Invoice | null, after: Invoice | null) {
		if (!after || after.status === 'draft' || (before && before.status !== 'draft') || after.documentId) return;
		queueMicrotask(() => void this.issue(after.id));
	}

	async issue(invoiceId: Invoice['id']) {
		const archived = await this.render(invoiceId, null);
		if (!archived) return;
		const invoice = this.#db.table('invoices').find((row) => row.id === invoiceId)!;
		this.#db.merge({
			...archived.rows,
			invoices: [
				{ ...invoice, documentId: archived.document.id, pdfSha256: archived.sha256, revision: invoice.revision + 1 },
			],
		});
	}

	/** Renders and stores an invoice or reminder PDF; returns its document and rows to merge. */
	async render(invoiceId: Invoice['id'], reminder: PdfReminder | null) {
		const invoice = this.#db.table('invoices').find((row) => row.id === invoiceId);
		const tenant = this.#db.table('tenants').find((row) => row.id === invoice?.tenantId);
		const actorId = this.#context.actorId();
		if (!invoice || !tenant || !actorId) return null;
		const contact = this.#db.table('contacts').find((row) => row.id === invoice.contactId);
		const locale: Locale = tenant.locale === 'en-US' ? 'en-US' : 'de-CH';
		const bundle = bundleFor(locale);
		const t = (key: string, params?: Record<string, string | number>) => interpolate(bundle.get(key) ?? key, params);
		// Loaded on first use: the PDF library and fonts stay out of the app's first download.
		const [{ renderInvoicePdf }, { browserPdfAssets }] = await Promise.all([
			import('@clinks/invoice-pdf/render'),
			import('./invoice-pdf-assets.ts'),
		]);
		const bytes = await renderInvoicePdf(
			{
				tenant,
				recipient: contact ? { name: contactName(contact), address: contact.address } : null,
				invoice,
				reminder: reminder ?? undefined,
				locale,
				t,
			},
			await browserPdfAssets(),
		);
		const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), (byte) =>
			byte.toString(16).padStart(2, '0'),
		).join('');
		const name = reminder
			? `${t('ui.ws.pdf.reminder', { level: reminder.level })} ${invoice.number}.pdf`
			: `${t('ui.ws.invoice.invoice')} ${invoice.number}.pdf`;
		const folders = this.#db.table('folders');
		const folderName = locale === 'en-US' ? 'Invoices' : 'Rechnungen';
		const existing = folders.find(
			(row) => row.tenantId === tenant.id && row.parentId === null && row.name === folderName,
		);
		const folder =
			existing ?? stamp<Folder>({ id: newId() as FolderId, tenantId: tenant.id, name: folderName, parentId: null });
		const document = stamp<StoredDocument>({
			id: newId() as DocumentId,
			tenantId: tenant.id,
			name,
			folderId: folder.id,
			mimeType: 'application/pdf',
			size: bytes.length,
			dataUrl: `data:application/pdf;base64,${base64(bytes)}`,
			targets: [{ kind: 'invoice', id: invoice.id }],
			uploadedBy: actorId,
			locked: true,
		});
		return {
			document,
			bytes,
			sha256,
			rows: { documents: [document], ...(existing ? {} : { folders: [folder] }) },
		};
	}
}

function base64(bytes: Uint8Array) {
	let binary = '';
	for (let index = 0; index < bytes.length; index += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	return btoa(binary);
}
