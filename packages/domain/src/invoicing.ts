import type { CalendarDate, Rappen, Tenant } from './types.ts';

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
