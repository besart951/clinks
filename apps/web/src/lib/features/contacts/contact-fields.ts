import type { InlineFieldSpec } from '@clinks/ui/kit/inline-edit';
import { ageOn, today } from '@clinks/domain/dates';
import type { Address, CalendarDate, Contact } from '@clinks/domain/types';

export interface FieldText {
	t: (key: string, params?: { [name: string]: string | number }) => string;
	date: (value: CalendarDate) => string;
}

export function formatAddress(address: Address): string {
	return [address.street, `${address.zip} ${address.city}`.trim()].filter(Boolean).join(', ');
}

/** Reads "Kramgasse 41, 3011 Bern" (street optional) back into its parts. */
export function parseAddress(value: string): Address {
	const parts = value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	const place = parts.at(-1) ?? '';
	const match = /^(\d{4,5})\s+(.+)$/.exec(place);
	if (match) return { street: parts.slice(0, -1).join(', '), zip: match[1], city: match[2] };
	if (parts.length > 1) return { street: parts.slice(0, -1).join(', '), zip: '', city: place };
	return { street: place, zip: '', city: '' };
}

/** The master-data rows of a contact, in the order the artefacts show them. */
export function contactFields(contact: Contact, text: FieldText): InlineFieldSpec[] {
	const required = (value: string) => (value ? null : text.t('ui.ws.inline.required'));
	const name: InlineFieldSpec[] =
		contact.kind === 'company'
			? [{ key: 'companyName', label: text.t('ui.ws.field.company'), value: contact.companyName, validate: required }]
			: [
					{ key: 'firstName', label: text.t('ui.ws.field.first_name'), value: contact.firstName },
					{ key: 'lastName', label: text.t('ui.ws.field.last_name'), value: contact.lastName, validate: required },
				];
	const person: InlineFieldSpec[] =
		contact.kind === 'person'
			? [
					{
						key: 'birthDate',
						label: text.t('ui.ws.field.birth_date'),
						value: contact.birthDate ?? '',
						kind: 'date',
						display: contact.birthDate ? text.date(contact.birthDate) : '',
						hint: contact.birthDate
							? text.t('ui.ws.inline.age', { years: ageOn(contact.birthDate, today()) })
							: undefined,
					},
				]
			: [];
	return [
		...name,
		...person,
		{ key: 'phone', label: text.t('ui.ws.field.phone'), value: contact.phone, kind: 'tel' },
		{ key: 'email', label: text.t('ui.email'), value: contact.email, kind: 'email' },
		{ key: 'address', label: text.t('ui.ws.contacts.address'), value: formatAddress(contact.address) },
		{ key: 'insurer', label: text.t('ui.ws.field.insurer'), value: contact.insurer, removable: true },
		...(contact.kind === 'person'
			? [
					{
						key: 'companyName',
						label: text.t('ui.ws.field.employer'),
						value: contact.companyName,
						removable: true,
					},
				]
			: []),
	];
}

/** Turns one edited row back into a contact patch. */
export function contactPatch(key: string, value: string): Partial<Contact> {
	if (key === 'address') return { address: parseAddress(value) };
	if (key === 'birthDate') return { birthDate: (value || null) as CalendarDate | null };
	return { [key]: value } as Partial<Contact>;
}
