import type { Contact } from './types.ts';

/** Placeholders usable in templates, personal mail and campaigns; replaced per recipient. */
export const placeholders = ['vorname', 'nachname', 'firma', 'anrede'] as const;

/**
 * Fills `{vorname}`, `{nachname}`, `{firma}` (the workspace) and `{anrede}` (the full name, or the company) for one
 * recipient; without a contact they become empty.
 */
export function fillPlaceholders(
	text: string,
	contact: Pick<Contact, 'firstName' | 'lastName' | 'companyName' | 'kind'> | null,
	company: string,
): string {
	const values: { [key: string]: string } = {
		vorname: contact?.firstName ?? '',
		nachname: contact?.lastName ?? contact?.companyName ?? '',
		firma: company,
		anrede:
			contact?.kind === 'company'
				? contact.companyName
				: `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim(),
	};
	return text.replace(/\{(vorname|nachname|firma|anrede)\}/g, (_, key: string) => values[key]);
}
