import { today } from '../../domain/dates.ts';
import type { InvoiceId } from '../../domain/ids.ts';
import { effectiveStatus, invoiceTotals, nextInvoiceNumber } from '../../domain/money.ts';
import type { Contact, Invoice, Rappen } from '../../domain/types.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** One invoice with its payments and the actions along its life cycle. */
export class InvoiceDetailModel {
	readonly resource: Resource<{ invoice: Invoice; contact: Contact | null }>;
	#workspace: Workspace;

	constructor(workspace: Workspace, id: InvoiceId) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['invoices', 'contacts'], async () => {
			const invoice = await workspace.api.invoices.get(id);
			const contact = await workspace.api.contacts.get(invoice.contactId).catch(() => null);
			return { invoice, contact };
		});
	}

	get status() {
		return this.resource.data ? effectiveStatus(this.resource.data.invoice, today()) : 'draft';
	}

	get totals() {
		return this.resource.data ? invoiceTotals(this.resource.data.invoice) : null;
	}

	issue() {
		return this.#patch({ status: 'open' }, 'ui.ws.invoice.issued');
	}

	recordPayment(amount: Rappen, date: string) {
		const invoice = this.resource.data!.invoice;
		return this.#patch({ payments: [...invoice.payments, { date, amount }] }, 'ui.ws.invoice.payment_recorded');
	}

	sendReminder() {
		const invoice = this.resource.data!.invoice;
		return this.#patch({ reminderLevel: invoice.reminderLevel + 1 }, 'ui.ws.invoice.reminder_sent', {
			level: invoice.reminderLevel + 1,
		});
	}

	cancel() {
		return this.#patch({ status: 'cancelled' }, 'ui.ws.invoice.cancelled');
	}

	async duplicate(): Promise<Invoice | null> {
		const invoice = this.resource.data!.invoice;
		const api = this.#workspace.api.invoices;
		return this.#workspace.run(
			async () => {
				const all = await api.list();
				return api.create({
					...invoice,
					number: nextInvoiceNumber(all, new Date().getFullYear()),
					status: 'draft',
					issueDate: today(),
					dueDate: invoice.dueDate,
					payments: [],
					reminderLevel: 0,
					appointmentIds: [],
				});
			},
			{ success: 'ui.ws.invoice.duplicated' },
		);
	}

	async remove(): Promise<boolean> {
		const invoice = this.resource.data!.invoice;
		const api = this.#workspace.api.invoices;
		return (
			(await this.#workspace.run(() => api.remove(invoice.id), {
				success: 'ui.ws.invoice.deleted',
				undo: () => api.restore(invoice),
			})) !== null
		);
	}

	#patch(patch: Partial<Invoice>, success: string, params: { [name: string]: string | number } = {}) {
		const invoice = this.resource.data!.invoice;
		return this.#workspace.run(() => this.#workspace.api.invoices.update(invoice.id, invoice.revision, patch), {
			success,
			successParams: { number: invoice.number, ...params },
		});
	}
}

export class InvoiceListModel {
	readonly resource: Resource<{ invoices: Invoice[]; contacts: Map<string, Contact> }>;
	status = $state<string>('');
	search = $state('');

	constructor(workspace: Workspace) {
		this.resource = new Resource(workspace.db, ['invoices', 'contacts'], async () => {
			const [invoices, contacts] = await Promise.all([
				workspace.api.invoices.list(),
				workspace.api.contacts.list().catch(() => []),
			]);
			return { invoices, contacts: new Map(contacts.map((contact) => [contact.id, contact])) };
		});
	}

	get rows() {
		const data = this.resource.data;
		if (!data) return [];
		const query = this.search.trim().toLowerCase();
		const day = today();
		return data.invoices
			.map((invoice) => ({
				invoice,
				contact: data.contacts.get(invoice.contactId) ?? null,
				status: effectiveStatus(invoice, day),
				totals: invoiceTotals(invoice),
			}))
			.filter(
				(row) =>
					(!this.status || row.status === this.status) &&
					(!query ||
						`${row.invoice.number} ${row.contact?.firstName ?? ''} ${row.contact?.lastName ?? ''} ${row.contact?.companyName ?? ''}`
							.toLowerCase()
							.includes(query)),
			)
			.sort((left, right) => right.invoice.number.localeCompare(left.invoice.number));
	}

	get summary() {
		const rows = this.resource.data ? this.rows : [];
		const all = this.resource.data?.invoices ?? [];
		const day = today();
		const open = all.filter((invoice) =>
			['open', 'partially_paid', 'overdue', 'reminded'].includes(effectiveStatus(invoice, day)),
		);
		return {
			count: rows.length,
			open: open.reduce((sum, invoice) => sum + invoiceTotals(invoice).balance, 0),
			overdue: open
				.filter((invoice) => ['overdue', 'reminded'].includes(effectiveStatus(invoice, day)))
				.reduce((sum, invoice) => sum + invoiceTotals(invoice).balance, 0),
			drafts: all.filter((invoice) => invoice.status === 'draft').length,
		};
	}
}
