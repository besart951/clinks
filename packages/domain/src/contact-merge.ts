import type { Address, Contact } from './types.ts';

/** The fields a merge decides one by one. Tags are always united; notes are joined and can be edited. */
export const mergeFields = [
	'firstName',
	'lastName',
	'companyName',
	'email',
	'phone',
	'mobile',
	'street',
	'houseNumber',
	'zip',
	'city',
	'birthDate',
	'insurer',
	'ahvNumber',
	'insuranceNumber',
	'language',
	'notes',
] as const;
export type MergeField = (typeof mergeFields)[number];
export type MergeValues = Record<MergeField, string>;

const addressParts = ['street', 'houseNumber', 'zip', 'city'] as const;
type AddressPart = (typeof addressParts)[number];

function isAddressPart(field: MergeField): field is AddressPart {
	return (addressParts as readonly string[]).includes(field);
}

/** A contact's value of one field, as text (empty when not set). */
export function mergeValue(contact: Contact, field: MergeField): string {
	if (isAddressPart(field)) return contact.address[field] ?? '';
	const value = contact[field];
	return typeof value === 'string' ? value : '';
}

/** Whether two contacts differ in a field that both have set: those need a decision. */
export function conflicting(left: Contact, right: Contact, field: MergeField): boolean {
	const [a, b] = [mergeValue(left, field).trim(), mergeValue(right, field).trim()];
	return a !== '' && b !== '' && a !== b;
}

/** Nothing decided yet. */
export function blankMerge(): MergeValues {
	return Object.fromEntries(mergeFields.map((field) => [field, ''])) as MergeValues;
}

/**
 * The starting result: the kept contact's values, its empty fields filled from the other ones in order, and the notes
 * of all of them joined.
 */
export function initialMerge(kept: Contact, others: readonly Contact[]): MergeValues {
	const values = {} as MergeValues;
	for (const field of mergeFields) {
		values[field] =
			field === 'notes'
				? [kept, ...others]
						.map((contact) => contact.notes.trim())
						.filter((note, index, notes) => note && notes.indexOf(note) === index)
						.join('\n\n')
				: ([kept, ...others].map((contact) => mergeValue(contact, field)).find((value) => value.trim()) ?? '');
	}
	return values;
}

/** The kept contact's update: the decided values, its address from the parts, and every tag of all contacts. */
export function mergePatch(values: MergeValues, contacts: readonly Contact[]): Partial<Contact> {
	const address: Address = {
		street: values.street.trim(),
		houseNumber: values.houseNumber.trim(),
		zip: values.zip.trim(),
		city: values.city.trim(),
	};
	const text = (field: Exclude<MergeField, AddressPart | 'birthDate'>) => values[field].trim();
	return {
		firstName: text('firstName'),
		lastName: text('lastName'),
		companyName: text('companyName'),
		email: text('email'),
		phone: text('phone'),
		mobile: text('mobile'),
		address,
		birthDate: (values.birthDate.trim() || null) as Contact['birthDate'],
		insurer: text('insurer'),
		ahvNumber: text('ahvNumber') || undefined,
		insuranceNumber: text('insuranceNumber') || undefined,
		language: text('language') || undefined,
		notes: values.notes.trim(),
		tags: [...new Set(contacts.flatMap((contact) => contact.tags))],
	};
}
