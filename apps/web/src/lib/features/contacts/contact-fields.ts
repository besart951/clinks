import { groupValue, readGroup, type InlineFieldSpec, type InlinePart } from '@clinks/ui/kit/inline-edit';
import { formatAddress, splitStreet } from '@clinks/domain/address';
import { ageOn, today } from '@clinks/domain/dates';
import type { Address, CalendarDate, Contact } from '@clinks/domain/types';

export interface FieldText {
	t: (key: string, params?: { [name: string]: string | number }) => string;
	date: (value: CalendarDate) => string;
}

/** Street, house number, postal code and city as one row that edits in four inputs. */
export function addressField(address: Address, text: FieldText): InlineFieldSpec {
	const parts: InlinePart[] = [
		{ key: 'street', label: text.t('ui.ws.field.street'), value: address.street, autocomplete: 'address-line1' },
		{ key: 'houseNumber', label: text.t('ui.ws.field.house_number'), value: address.houseNumber ?? '', narrow: true },
		{
			key: 'zip',
			label: text.t('ui.ws.field.zip'),
			value: address.zip,
			narrow: true,
			autocomplete: 'postal-code',
			inputmode: 'numeric',
		},
		{ key: 'city', label: text.t('ui.ws.field.city'), value: address.city, autocomplete: 'address-level2' },
	];
	return {
		key: 'address',
		label: text.t('ui.ws.contacts.address'),
		kind: 'group',
		parts,
		value: groupValue(parts),
		display: formatAddress(address),
		validate: (value) => (/^(\d{4,5})?$/u.test(readAddress(value).zip) ? null : text.t('error.ws.invalid_zip')),
	};
}

/**
 * Reads the edited parts back. A street typed or autofilled with its number («Bahnhofstrasse 57») is split
 * when the house number is left empty.
 */
export function readAddress(value: string): Address {
	const parts = readGroup(value);
	const read = (key: string) => (parts[key] ?? '').trim();
	const street = read('houseNumber')
		? { street: read('street'), houseNumber: read('houseNumber') }
		: splitStreet(read('street'));
	return { ...street, zip: read('zip'), city: read('city') };
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
		addressField(contact.address, text),
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
	if (key === 'address') return { address: readAddress(value) };
	if (key === 'birthDate') return { birthDate: (value || null) as CalendarDate | null };
	return { [key]: value } as Partial<Contact>;
}
