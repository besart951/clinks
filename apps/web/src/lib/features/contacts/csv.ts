import { splitStreet } from '@clinks/domain/address';
import type { Contact } from '@clinks/domain/types';
import type { Draft } from '@clinks/contracts/repository';
import { emptyContact } from './empty-contact.ts';

/** Splits CSV text with comma or semicolon separators and quoted fields. */
export function parseCsv(text: string): string[][] {
	const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
	const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let index = 0; index < text.length; index++) {
		const character = text[index];
		if (quoted) {
			if (character === '"' && text[index + 1] === '"') {
				field += '"';
				index++;
			} else if (character === '"') quoted = false;
			else field += character;
		} else if (character === '"') quoted = true;
		else if (character === separator) {
			row.push(field.trim());
			field = '';
		} else if (character === '\n' || character === '\r') {
			if (character === '\r' && text[index + 1] === '\n') index++;
			row.push(field.trim());
			if (row.some((value) => value !== '')) rows.push(row);
			row = [];
			field = '';
		} else field += character;
	}
	row.push(field.trim());
	if (row.some((value) => value !== '')) rows.push(row);
	return rows;
}

const columnAliases: { [field: string]: string[] } = {
	firstName: ['vorname', 'first name', 'firstname', 'prénom'],
	lastName: ['nachname', 'name', 'last name', 'lastname', 'nom'],
	companyName: ['firma', 'company', 'unternehmen', 'organisation'],
	email: ['e-mail', 'email', 'mail'],
	phone: ['telefon', 'phone', 'tel', 'mobile', 'handy'],
	street: ['strasse', 'adresse', 'street', 'address'],
	houseNumber: ['hausnummer', 'hausnr', 'nr', 'nr.', 'house number', 'number', 'numéro'],
	zip: ['plz', 'zip', 'postleitzahl'],
	city: ['ort', 'city', 'stadt', 'wohnort'],
};

/** Maps header names in German, English or French to contact fields. */
export function contactsFromCsv(rows: string[][]): Draft<Contact>[] {
	const [header, ...data] = rows;
	if (!header) return [];
	const index = (field: string) => header.findIndex((name) => columnAliases[field].includes(name.trim().toLowerCase()));
	const columns = Object.fromEntries(Object.keys(columnAliases).map((field) => [field, index(field)]));
	const value = (row: string[], field: string) => (columns[field] >= 0 ? (row[columns[field]] ?? '') : '');
	return data.map((row) => {
		const company = value(row, 'companyName');
		const lastName = value(row, 'lastName');
		return {
			...emptyContact(company && !lastName ? 'company' : 'person'),
			firstName: value(row, 'firstName'),
			lastName,
			companyName: company,
			email: value(row, 'email'),
			phone: value(row, 'phone'),
			address: {
				// One «Adresse» column with the number in it is split as well.
				...(value(row, 'houseNumber')
					? { street: value(row, 'street'), houseNumber: value(row, 'houseNumber') }
					: splitStreet(value(row, 'street'))),
				zip: value(row, 'zip'),
				city: value(row, 'city'),
			},
			tags: ['Import'],
		};
	});
}

/** Pairs of contacts that are probably the same person (same email or same name and city). */
export function duplicateKey(
	contact: Pick<Contact, 'email' | 'firstName' | 'lastName' | 'companyName' | 'address'>,
): string {
	if (contact.email) return contact.email.toLowerCase();
	return `${contact.firstName} ${contact.lastName} ${contact.companyName} ${contact.address.city}`
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}
