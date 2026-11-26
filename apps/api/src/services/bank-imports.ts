import type { BankEntryView, BankImportInput, BankImportView } from '@clinks/contracts/finance';
import { inScope, type Tx } from '@clinks/db/scope';
import { sql } from 'kysely';
import { CamtError, matchCredit, parseCamt, suggestInvoices, type BankCredit } from '@clinks/domain/camt';
import { contactName } from '@clinks/domain/contacts';
import { invoiceTotals } from '@clinks/domain/money';
import type { Contact, Invoice, Payment } from '@clinks/domain/types';
import { createHash } from 'node:crypto';
import { uuid } from '../crypto.ts';
import { ApiError, forbidden } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';
import { archiveServerFile } from './files.ts';
import { requirePermission } from './permissions.ts';

type Scope = { tenantId: string; userId: string };

/** Folder the bank files go into, per workspace language. */
const folderName = { 'de-CH': 'Zahlungseingänge', 'en-US': 'Payments received' } as const;

/**
 * Payments from e-banking files (camt.054, camt.053): each booked credit is matched by its QR or Creditor
 * Reference and booked on the invoice; the rest waits to be assigned by hand. The file is archived, its bank
 * entry references keep a second import of the same credits from booking anything.
 */
export class BankImportService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}

	import(claims: AccessClaims, input: BankImportInput, caller: Caller): Promise<BankImportView> {
		return this.#scoped(claims, 'finance.write', async (tx, scope) => {
			const bytes = new TextEncoder().encode(input.content);
			const sha256 = createHash('sha256').update(bytes).digest('hex');
			const known = await tx.selectFrom('bankImports').select('id').where('sha256', '=', sha256).executeTakeFirst();
			if (known) return { ...(await this.#importView(tx, known.id)), repeated: true };
			let file;
			try {
				file = parseCamt(input.content);
			} catch (error) {
				if (error instanceof CamtError) throw new ApiError(400, 'error.ws.bank_file_invalid');
				throw error;
			}
			const tenant = await tx
				.selectFrom('tenants')
				.select('locale')
				.where('id', '=', scope.tenantId)
				.executeTakeFirstOrThrow();
			const documentId = await archiveServerFile(tx, this.#services, scope, {
				name: input.fileName,
				folder: folderName[tenant.locale === 'en-US' ? 'en-US' : 'de-CH'],
				bytes,
				type: 'application/xml',
				targets: [],
			});
			const importId = uuid();
			await tx
				.insertInto('bankImports')
				.values({
					id: importId,
					tenantId: scope.tenantId,
					fileName: input.fileName,
					kind: file.kind,
					sha256,
					documentId,
					importedAt: this.#services.now(),
					importedBy: scope.userId,
					credits: file.credits.length,
					booked: 0,
					duplicates: 0,
				})
				.execute();
			const invoices = await this.#invoices(tx);
			let booked = 0;
			let duplicates = 0;
			for (const credit of file.credits) {
				const seen = await tx
					.selectFrom('bankEntries')
					.select('id')
					.where('bankRef', '=', credit.bankRef)
					.executeTakeFirst();
				if (seen) {
					duplicates++;
					continue;
				}
				const invoice = credit.currency === 'CHF' ? matchCredit(credit, invoices) : null;
				const id = uuid();
				await this.#insertEntry(tx, scope, importId, id, credit, invoice?.id ?? null);
				if (invoice) {
					await this.#book(tx, scope, caller, invoice.id, { date: credit.date, amount: credit.amount, entryId: id });
					// Later credits in the same file see this payment.
					invoice.payments = [...invoice.payments, { date: credit.date, amount: credit.amount }];
					booked++;
				}
			}
			await tx.updateTable('bankImports').set({ booked, duplicates }).where('id', '=', importId).execute();
			await audit(
				tx,
				{
					action: 'bank_import.created',
					actorId: scope.userId,
					tenantId: scope.tenantId,
					target: importId,
					meta: { credits: file.credits.length, booked, duplicates },
				},
				caller,
			);
			return { ...(await this.#importView(tx, importId)), repeated: false };
		});
	}

	imports(claims: AccessClaims): Promise<BankImportView[]> {
		return this.#scoped(claims, 'finance.read', async (tx) => {
			const rows = await tx.selectFrom('bankImports').select('id').orderBy('importedAt', 'desc').limit(20).execute();
			return Promise.all(rows.map(async (row) => ({ ...(await this.#importView(tx, row.id)), repeated: false })));
		});
	}

	/** Credits still to assign, each with up to three invoices it may pay. */
	openEntries(claims: AccessClaims): Promise<BankEntryView[]> {
		return this.#scoped(claims, 'finance.read', async (tx) => {
			const entries = await tx
				.selectFrom('bankEntries')
				.selectAll()
				.where('status', '=', 'open')
				.orderBy('bookedOn', 'desc')
				.execute();
			if (entries.length === 0) return [];
			const invoices = await this.#invoices(tx);
			const contacts = new Map(
				(await tx.selectFrom('contacts').select(['id', 'kind', 'firstName', 'lastName', 'companyName']).execute()).map(
					(row) => [String(row.id), contactName(row as unknown as Contact)],
				),
			);
			const name = (invoice: Invoice) => contacts.get(invoice.contactId) ?? '';
			return entries.map((entry) => ({
				...entryView(entry),
				suggestions: suggestInvoices({ amount: entry.amount, debtor: entry.debtor }, invoices, name).map((invoice) => ({
					invoiceId: invoice.id,
					number: invoice.number,
					recipient: name(invoice),
					balance: balanceOf(invoice),
				})),
			}));
		});
	}

	/** Books an open credit on an invoice chosen by hand. */
	assign(claims: AccessClaims, entryId: string, invoiceId: string, caller: Caller) {
		return this.#scoped(claims, 'finance.write', async (tx, scope) => {
			const entry = await this.#openEntry(tx, entryId);
			const invoice = await tx.selectFrom('invoices').select(['status']).where('id', '=', invoiceId).executeTakeFirst();
			if (!invoice) throw new ApiError(404, 'error.ws.not_found');
			if (invoice.status === 'draft' || invoice.status === 'cancelled')
				throw new ApiError(400, 'error.ws.invoice_not_issued');
			await tx.updateTable('bankEntries').set({ status: 'booked', invoiceId }).where('id', '=', entryId).execute();
			await this.#book(tx, scope, caller, invoiceId, { date: entry.bookedOn, amount: entry.amount, entryId });
		});
	}

	/** Leaves a credit that pays no invoice (a refund, a transfer) out of the list. */
	ignore(claims: AccessClaims, entryId: string, caller: Caller) {
		return this.#scoped(claims, 'finance.write', async (tx, scope) => {
			await this.#openEntry(tx, entryId);
			await tx.updateTable('bankEntries').set({ status: 'ignored' }).where('id', '=', entryId).execute();
			await audit(
				tx,
				{ action: 'bank_entry.ignored', actorId: scope.userId, tenantId: scope.tenantId, target: entryId },
				caller,
			);
		});
	}

	async #openEntry(tx: Tx, entryId: string) {
		const entry = await tx.selectFrom('bankEntries').selectAll().where('id', '=', entryId).executeTakeFirst();
		if (!entry) throw new ApiError(404, 'error.ws.not_found');
		if (entry.status !== 'open') throw new ApiError(409, 'error.ws.bank_entry_done');
		return entry;
	}

	async #insertEntry(tx: Tx, scope: Scope, importId: string, id: string, credit: BankCredit, invoiceId: string | null) {
		await tx
			.insertInto('bankEntries')
			.values({
				id,
				tenantId: scope.tenantId,
				importId,
				bankRef: credit.bankRef,
				bookedOn: credit.date,
				amount: credit.amount,
				currency: credit.currency,
				reference: credit.reference,
				debtor: credit.debtor.slice(0, 200),
				info: credit.info.slice(0, 500),
				status: invoiceId ? 'booked' : 'open',
				invoiceId,
			})
			.execute();
	}

	/** Appends the payment to the invoice (payments stay open to change after issue, see migration 0018). */
	async #book(tx: Tx, scope: Scope, caller: Caller, invoiceId: string, payment: Payment) {
		await tx
			.updateTable('invoices')
			.set((eb) => ({
				payments: sql`payments || ${JSON.stringify([payment])}::jsonb`,
				revision: eb('revision', '+', 1),
				updatedAt: this.#services.now(),
			}))
			.where('id', '=', invoiceId)
			.execute();
		await audit(
			tx,
			{
				action: 'invoice.payment_booked',
				actorId: scope.userId,
				tenantId: scope.tenantId,
				target: invoiceId,
				meta: { amount: payment.amount, entry: payment.entryId },
			},
			caller,
		);
	}

	async #invoices(tx: Tx) {
		const rows = await tx
			.selectFrom('invoices')
			.select(['id', 'number', 'status', 'lines', 'payments', 'reminders', 'contactId'])
			.where('status', 'not in', ['draft', 'cancelled'])
			.execute();
		return rows as unknown as Invoice[];
	}

	async #importView(tx: Tx, id: string) {
		const row = await tx
			.selectFrom('bankImports')
			.leftJoin('users', 'users.id', 'bankImports.importedBy')
			.selectAll('bankImports')
			.select(['users.firstName', 'users.lastName', 'users.email'])
			.where('bankImports.id', '=', id)
			.executeTakeFirstOrThrow();
		return {
			id: row.id,
			fileName: row.fileName,
			kind: row.kind,
			importedAt: row.importedAt.toISOString(),
			importedBy: `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim() || (row.email ?? ''),
			credits: row.credits,
			booked: row.booked,
			duplicates: row.duplicates,
		};
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

function entryView(entry: {
	id: string;
	importId: string;
	bookedOn: string;
	amount: number;
	currency: string;
	reference: string;
	debtor: string;
	info: string;
	status: 'booked' | 'open' | 'ignored';
	invoiceId: string | null;
}) {
	return {
		id: entry.id,
		importId: entry.importId,
		date: String(entry.bookedOn),
		amount: entry.amount,
		currency: entry.currency,
		reference: entry.reference,
		debtor: entry.debtor,
		info: entry.info,
		status: entry.status,
		invoiceId: entry.invoiceId,
	};
}

function balanceOf(invoice: Invoice) {
	return invoiceTotals(invoice).balance;
}
