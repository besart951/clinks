import { addDays } from './dates.ts';
import { invoiceTotals } from './money.ts';
import type { CalendarDate, Invoice, Rappen, Tenant } from './types.ts';

/**
 * One reminder level: the days it gives to pay, a fee and an own text ('' = the default). A level is due once the
 * invoice's due date, or the previous reminder's deadline, has passed.
 */
export interface ReminderStep {
	days: number;
	fee: Rappen;
	text: string;
}

/** How a workspace invoices: payment term, footer, delivery and reminders. */
export interface InvoiceSettings {
	paymentTermDays: number;
	footer: string;
	/** `auto`: a secure link when Physio or Spitex is booked (health data), else the PDF attached. */
	delivery: 'auto' | 'attachment' | 'link';
	reminders: ReminderStep[];
	/** Default interest of 5 % a year after a reminder (Art. 104 OR); off unless the workspace switches it on. */
	defaultInterest: boolean;
	/** Where replies to sent invoices go; '' = the person who sends. Missing on workspaces set up before it. */
	replyTo?: string;
}

export const defaultInvoiceSettings: InvoiceSettings = {
	paymentTermDays: 30,
	footer: '',
	delivery: 'auto',
	reminders: [
		{ days: 10, fee: 0, text: '' },
		{ days: 10, fee: 0, text: '' },
		{ days: 10, fee: 0, text: '' },
	],
	defaultInterest: false,
	replyTo: '',
};

/** How an invoice or reminder reaches the recipient by e-mail. */
export type DeliveryMethod = 'attachment' | 'link';

/** Days a secure invoice link stays valid. */
export const linkLifetimeDays = 90;

/** Wrong postcodes before a secure link stops working; the workspace then sends a new one. */
export const linkAttempts = 5;

/** The way a workspace sends by default: a secure link when it handles health data (Physio or Spitex). */
export function defaultDelivery(
	settings: Pick<InvoiceSettings, 'delivery'>,
	tenant: Pick<Tenant, 'industry' | 'enabledModules'>,
): DeliveryMethod {
	if (settings.delivery !== 'auto') return settings.delivery;
	const health =
		tenant.industry !== 'services' ||
		tenant.enabledModules.some((module) => module === 'physio' || module === 'spitex');
	return health ? 'link' : 'attachment';
}

/** Postcodes compared as the recipient types them: case, spaces and a country prefix («CH-») do not matter. */
export function samePostcode(typed: string, stored: string) {
	const normalize = (value: string) =>
		value
			.toUpperCase()
			.replace(/\s+/g, '')
			.replace(/^[A-Z]{1,2}-/, '');
	return normalize(stored) !== '' && normalize(typed) === normalize(stored);
}

/** The period an invoice bills, from the appointments it covers; one day when there are none. */
export function servicePeriod(dates: readonly CalendarDate[], fallback: CalendarDate) {
	if (dates.length === 0) return { from: fallback, to: fallback };
	const sorted = [...dates].sort();
	return { from: sorted[0], to: sorted.at(-1)! };
}

/** The reminder an invoice can get next, and since when it is due; null when none is left or nothing is owed. */
export function nextReminder(
	invoice: Pick<Invoice, 'status' | 'dueDate' | 'reminderLevel' | 'reminders' | 'lines' | 'payments'>,
	settings: Pick<InvoiceSettings, 'reminders'>,
	today: CalendarDate,
) {
	if (invoice.status === 'draft' || invoice.status === 'cancelled') return null;
	if (invoiceTotals(invoice).balance <= 0) return null;
	const sent = Math.max(invoice.reminders.length, invoice.reminderLevel);
	const step = settings.reminders[sent];
	if (!step) return null;
	const last = invoice.reminders.at(-1);
	// A level made outside CLinks (only `reminderLevel`) counts as sent on the due date.
	const since = addDays(sent > 0 && last ? last.dueDate : invoice.dueDate, 1);
	return {
		level: sent + 1,
		step,
		since,
		due: since <= today,
		/** The deadline the reminder prints when sent today. */
		dueDate: addDays(today, step.days),
	};
}
