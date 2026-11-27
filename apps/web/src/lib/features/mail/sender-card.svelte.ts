import { invoiceTotals } from '@clinks/domain/money';
import type { Appointment, Contact, Invoice } from '@clinks/domain/types';
import type { Workspace } from '../../workspace.svelte.ts';

/** What the card about a mail's sender shows from the other modules: the next appointment and what is owed. */
export interface SenderFacts {
	next: Appointment | null;
	/** Invoices with something left to pay, and the sum of it in Rappen. */
	open: { count: number; balance: number } | null;
}

/** Loaded when the card opens, once per sender; each part only with the right to see it. */
export class SenderCardModel {
	facts = $state.raw<SenderFacts | null>(null);
	#loading: Promise<void> | null = null;
	readonly #workspace: Workspace;
	readonly #contact: Contact;

	constructor(workspace: Workspace, contact: Contact) {
		this.#workspace = workspace;
		this.#contact = contact;
	}

	load() {
		this.#loading ??= this.#load();
		return this.#loading;
	}

	async #load() {
		const { api, session } = this.#workspace;
		const id = this.#contact.id;
		const now = new Date().toISOString();
		const [appointments, invoices] = await Promise.all([
			session.can('calendar.read')
				? api.appointments.list((row) => row.contactId === id && row.start >= now && row.status !== 'cancelled')
				: Promise.resolve(null),
			session.can('finance.read') && session.hasModule('finance')
				? api.invoices.list((row) => row.contactId === id && row.status !== 'draft' && row.status !== 'cancelled')
				: Promise.resolve(null),
		]).catch(() => [null, null] as const);
		const owing = (invoices ?? []).filter((invoice: Invoice) => invoiceTotals(invoice).balance > 0);
		this.facts = {
			next: appointments
				? ([...appointments].sort((left, right) => left.start.localeCompare(right.start))[0] ?? null)
				: null,
			open: invoices
				? { count: owing.length, balance: owing.reduce((sum, invoice) => sum + invoiceTotals(invoice).balance, 0) }
				: null,
		};
	}
}
