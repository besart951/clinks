import { daysBetween } from './dates.ts';
import type { CalendarDate, Invoice, InvoiceLine, InvoiceStatus, Rappen, VatRate } from './types.ts';

export interface VatShare {
	rate: VatRate;
	net: Rappen;
	vat: Rappen;
}

export interface InvoiceTotals {
	net: Rappen;
	vat: Rappen;
	gross: Rappen;
	paid: Rappen;
	/** Reminder fees charged so far; owed on top of the invoice, without VAT (compensation, not a service). */
	fees: Rappen;
	/** What is still owed: gross plus fees, minus payments. */
	balance: Rappen;
	shares: VatShare[];
}

/** Swiss invoices round the payable amount to five Rappen. */
export function roundToFiveRappen(amount: Rappen): Rappen {
	return Math.round(amount / 5) * 5;
}

export function lineNet(line: InvoiceLine): Rappen {
	return Math.round(line.quantity * line.unitPrice);
}

export function invoiceTotals(
	invoice: Pick<Invoice, 'lines' | 'payments'> & Partial<Pick<Invoice, 'reminders'>>,
): InvoiceTotals {
	const byRate = new Map<VatRate, Rappen>();
	for (const line of invoice.lines) byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0) + lineNet(line));
	const shares = [...byRate.entries()]
		.map(([rate, net]) => ({ rate, net, vat: Math.round((net * rate) / 10_000) }))
		.sort((left, right) => right.rate - left.rate);
	const net = shares.reduce((sum, share) => sum + share.net, 0);
	const vat = shares.reduce((sum, share) => sum + share.vat, 0);
	const gross = roundToFiveRappen(net + vat);
	const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
	const fees = (invoice.reminders ?? []).reduce((sum, reminder) => sum + reminder.fee, 0);
	return { net, vat, gross, paid, fees, balance: gross + fees - paid, shares };
}

/** Status shown to people: stored state plus what follows from payments and the due date. */
export function effectiveStatus(invoice: Invoice, on: CalendarDate): InvoiceStatus {
	if (invoice.status === 'draft' || invoice.status === 'cancelled') return invoice.status;
	const totals = invoiceTotals(invoice);
	if (totals.balance <= 0) return 'paid';
	if (invoice.reminderLevel > 0) return 'reminded';
	if (daysBetween(invoice.dueDate, on) > 0) return 'overdue';
	return totals.paid > 0 ? 'partially_paid' : 'open';
}

export function nextInvoiceNumber(existing: readonly Pick<Invoice, 'number'>[], year: number): string {
	const prefix = `${year}-`;
	const highest = existing
		.filter((invoice) => invoice.number.startsWith(prefix))
		.map((invoice) => Number(invoice.number.slice(prefix.length)))
		.filter(Number.isFinite)
		.reduce((max, value) => Math.max(max, value), 0);
	return `${prefix}${String(highest + 1).padStart(4, '0')}`;
}

export function vatFromGross(gross: Rappen, rate: VatRate): Rappen {
	return Math.round((gross * rate) / (10_000 + rate));
}
