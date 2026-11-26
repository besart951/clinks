import type { BankEntryView, BankImportInput, BankImportView } from '@clinks/contracts/finance';
import { CamtError, matchCredit, parseCamt, suggestInvoices } from '@clinks/domain/camt';
import { contactName } from '@clinks/domain/contacts';
import { newId, type DocumentId, type FolderId, type InvoiceId } from '@clinks/domain/ids';
import { invoiceTotals } from '@clinks/domain/money';
import type { Folder, Invoice, StoredDocument } from '@clinks/domain/types';
import { MockApiError, stamp, type MockBankEntry, type MockBankImport, type WorkspaceCache } from './database.ts';
import { appendAudit, type RequestContext } from './repository.ts';

/**
 * The demo's stand-in for bank file imports (apps/api services/bank-imports.ts): the same parser and matching,
 * the file kept as a locked document in «Zahlungseingänge», payments booked on the invoices.
 */
export class MockBankImports {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	async import(input: BankImportInput): Promise<BankImportView> {
		const bytes = new TextEncoder().encode(input.content);
		const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
			byte.toString(16).padStart(2, '0'),
		).join('');
		return this.#db.request(() => {
			const { tenantId, actorId } = this.#allowed('finance.write');
			const known = this.#db.table('bankImports').find((row) => row.tenantId === tenantId && row.sha256 === sha256);
			if (known) return { ...view(known), repeated: true };
			let file;
			try {
				file = parseCamt(input.content);
			} catch (error) {
				if (error instanceof CamtError) throw this.#error('validation', 'error.ws.bank_file_invalid');
				throw error;
			}
			const tenant = this.#db.table('tenants').find((row) => row.id === tenantId)!;
			const user = this.#db.table('users').find((row) => row.id === actorId);
			const document = this.#archive(tenantId, actorId, tenant.locale, input.fileName, input.content);
			const record: MockBankImport = {
				id: newId(),
				tenantId,
				fileName: input.fileName,
				kind: file.kind,
				importedAt: new Date().toISOString(),
				importedBy: user ? `${user.firstName} ${user.lastName}`.trim() : '',
				credits: file.credits.length,
				booked: 0,
				duplicates: 0,
				sha256,
				documentId: document.id,
			};
			const invoices = this.#invoices(tenantId);
			const entries = this.#db.table('bankEntries');
			for (const credit of file.credits) {
				if (entries.some((entry) => entry.tenantId === tenantId && entry.bankRef === credit.bankRef)) {
					record.duplicates++;
					continue;
				}
				const invoice = credit.currency === 'CHF' ? matchCredit(credit, invoices) : null;
				const entry: MockBankEntry = {
					id: newId(),
					tenantId,
					importId: record.id,
					bankRef: credit.bankRef,
					date: credit.date,
					amount: credit.amount,
					currency: credit.currency,
					reference: credit.reference,
					debtor: credit.debtor,
					info: credit.info,
					status: invoice ? 'booked' : 'open',
					invoiceId: invoice?.id ?? null,
				};
				entries.push(entry);
				if (invoice) {
					this.#book(invoice, entry, actorId);
					record.booked++;
				}
			}
			this.#db.table('bankImports').push(record);
			return { ...view(record), repeated: false };
		}, ['bankImports', 'bankEntries', 'invoices', 'documents', 'folders', 'audit']);
	}

	imports(): Promise<BankImportView[]> {
		return this.#db.request(() => {
			const { tenantId } = this.#allowed('finance.read');
			return this.#db
				.table('bankImports')
				.filter((row) => row.tenantId === tenantId)
				.sort((left, right) => right.importedAt.localeCompare(left.importedAt))
				.slice(0, 20)
				.map((row) => ({ ...view(row), repeated: false }));
		});
	}

	openEntries(): Promise<BankEntryView[]> {
		return this.#db.request(() => {
			const { tenantId } = this.#allowed('finance.read');
			const invoices = this.#invoices(tenantId);
			const contacts = new Map(this.#db.table('contacts').map((contact) => [contact.id, contactName(contact)]));
			const name = (invoice: Invoice) => contacts.get(invoice.contactId) ?? '';
			return this.#db
				.table('bankEntries')
				.filter((entry) => entry.tenantId === tenantId && entry.status === 'open')
				.sort((left, right) => right.date.localeCompare(left.date))
				.map(({ tenantId: _tenant, bankRef: _ref, ...entry }) => ({
					...entry,
					suggestions: suggestInvoices(entry, invoices, name).map((invoice) => ({
						invoiceId: invoice.id,
						number: invoice.number,
						recipient: name(invoice),
						balance: invoiceTotals(invoice).balance,
					})),
				}));
		});
	}

	assign(entryId: string, invoiceId: InvoiceId): Promise<void> {
		return this.#db.request(() => {
			const { tenantId, actorId } = this.#allowed('finance.write');
			const entry = this.#open(entryId, tenantId);
			const invoice = this.#invoices(tenantId).find((candidate) => candidate.id === invoiceId);
			if (!invoice) throw this.#error('validation', 'error.ws.invoice_not_issued');
			entry.status = 'booked';
			entry.invoiceId = invoice.id;
			this.#book(invoice, entry, actorId);
		}, ['bankEntries', 'invoices', 'audit']);
	}

	ignore(entryId: string): Promise<void> {
		return this.#db.request(() => {
			const { tenantId } = this.#allowed('finance.write');
			this.#open(entryId, tenantId).status = 'ignored';
		}, ['bankEntries']);
	}

	#book(invoice: Invoice, entry: MockBankEntry, actorId: NonNullable<ReturnType<RequestContext['actorId']>>) {
		const stored = this.#db.table('invoices').find((row) => row.id === invoice.id)!;
		const payments = [...stored.payments, { date: entry.date, amount: entry.amount, entryId: entry.id }];
		this.#db.replace(
			'invoices',
			this.#db
				.table('invoices')
				.map((row) =>
					row.id === stored.id
						? { ...row, payments, revision: row.revision + 1, updatedAt: new Date().toISOString() }
						: row,
				),
		);
		// Later credits of the same file see this payment.
		invoice.payments = payments;
		appendAudit(this.#db, {
			tenantId: stored.tenantId,
			actorId,
			action: 'invoice.payment_booked',
			target: { kind: 'invoice', id: stored.id, label: stored.number },
		});
	}

	#archive(
		tenantId: MockBankImport['tenantId'],
		actorId: NonNullable<ReturnType<RequestContext['actorId']>>,
		locale: string,
		name: string,
		content: string,
	) {
		const folderName = locale === 'en-US' ? 'Payments received' : 'Zahlungseingänge';
		const folders = this.#db.table('folders');
		let folder = folders.find((row) => row.tenantId === tenantId && row.parentId === null && row.name === folderName);
		if (!folder) {
			folder = stamp<Folder>({ id: newId() as FolderId, tenantId, name: folderName, parentId: null });
			folders.push(folder);
		}
		const bytes = new TextEncoder().encode(content);
		let binary = '';
		for (const byte of bytes) binary += String.fromCharCode(byte);
		const document = stamp<StoredDocument>({
			id: newId() as DocumentId,
			tenantId,
			name,
			folderId: folder.id,
			mimeType: 'application/xml',
			size: bytes.length,
			dataUrl: `data:application/xml;base64,${btoa(binary)}`,
			targets: [],
			uploadedBy: actorId,
			locked: true,
		});
		this.#db.table('documents').push(document);
		return document;
	}

	#invoices(tenantId: string) {
		return this.#db
			.table('invoices')
			.filter((row) => row.tenantId === tenantId && row.status !== 'draft' && row.status !== 'cancelled')
			.map((row) => ({ ...row }));
	}

	#open(entryId: string, tenantId: string) {
		const entry = this.#db.table('bankEntries').find((row) => row.id === entryId && row.tenantId === tenantId);
		if (!entry) throw this.#error('not_found', 'error.ws.not_found');
		if (entry.status !== 'open') throw this.#error('conflict', 'error.ws.bank_entry_done');
		return entry;
	}

	#allowed(permission: 'finance.read' | 'finance.write') {
		const tenantId = this.#context.tenantId();
		const actorId = this.#context.actorId();
		if (!tenantId || !actorId) throw this.#error('unauthorized', 'error.unauthorized');
		if (!this.#context.can(permission)) throw this.#error('forbidden', 'error.forbidden');
		return { tenantId, actorId };
	}

	#error(code: ConstructorParameters<typeof MockApiError>[0], key: string) {
		return new MockApiError(code, this.#context.localize(key));
	}
}

function view({ tenantId: _tenant, sha256: _sha, documentId: _document, ...row }: MockBankImport) {
	return row;
}
