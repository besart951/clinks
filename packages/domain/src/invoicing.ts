import type { CalendarDate, Rappen } from './types.ts';

/** One reminder level: days after the due date (or the last reminder), a fee and an own text ('' = the default). */
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
};

/** The period an invoice bills, from the appointments it covers; one day when there are none. */
export function servicePeriod(dates: readonly CalendarDate[], fallback: CalendarDate) {
	if (dates.length === 0) return { from: fallback, to: fallback };
	const sorted = [...dates].sort();
	return { from: sorted[0], to: sorted.at(-1)! };
}
