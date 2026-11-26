import type { BankEntryView, BankImportView } from '@clinks/contracts/finance';
import type { InvoiceId } from '@clinks/domain/ids';
import { contactName } from '@clinks/domain/contacts';
import { effectiveStatus, invoiceTotals } from '@clinks/domain/money';
import { today } from '@clinks/domain/dates';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface OpenInvoiceOption {
	id: InvoiceId;
	label: string;
}

/** Finance › Zahlungseingang: import bank files, assign the credits no reference matched. */
export class PaymentsModel {
	readonly resource: Resource<{ imports: BankImportView[]; entries: BankEntryView[]; invoices: OpenInvoiceOption[] }>;
	busy = $state(false);
	/** The last import, shown until the next one. */
	result = $state<BankImportView | null>(null);
	readonly #workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['invoices', 'bankImports', 'bankEntries'], async () => {
			const bank = workspace.bankImports;
			const [imports, entries, invoices, contacts] = await Promise.all([
				bank.imports(),
				bank.openEntries(),
				workspace.api.invoices.list(),
				workspace.api.contacts.list().catch(() => []),
			]);
			const names = new Map(contacts.map((contact) => [contact.id, contactName(contact)]));
			const day = today();
			const open = invoices
				.filter((invoice) => ['open', 'partially_paid', 'overdue', 'reminded'].includes(effectiveStatus(invoice, day)))
				.sort((left, right) => left.number.localeCompare(right.number))
				.map((invoice) => ({
					id: invoice.id,
					label: `${invoice.number} · ${names.get(invoice.contactId) ?? '—'} · ${workspace.i18n.money(invoiceTotals(invoice).balance)}`,
				}));
			return { imports, entries, invoices: open };
		});
	}

	async upload(file: File | undefined) {
		if (!file || this.busy) return;
		this.busy = true;
		try {
			const content = await file.text();
			const result = await this.#workspace.run(() => this.#workspace.bankImports.import({ name: file.name, content }));
			if (result) {
				this.result = result;
				void this.resource.reload(true);
			}
		} finally {
			this.busy = false;
		}
	}

	async assign(entry: BankEntryView, invoiceId: string) {
		const done = await this.#workspace.run(() => this.#workspace.bankImports.assign(entry.id, invoiceId as InvoiceId), {
			success: 'ui.ws.payments.assigned',
			successParams: { amount: this.#workspace.i18n.money(entry.amount) },
		});
		if (done !== null) void this.resource.reload(true);
	}

	async ignore(entry: BankEntryView) {
		const done = await this.#workspace.run(() => this.#workspace.bankImports.ignore(entry.id), {
			success: 'ui.ws.payments.ignored',
		});
		if (done !== null) void this.resource.reload(true);
	}
}
