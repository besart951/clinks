import type { Contact } from './types.ts';

/** How a contact is named: a company by its name, a person by first and last name. */
export function contactName(contact: Pick<Contact, 'kind' | 'firstName' | 'lastName' | 'companyName'>): string {
	return contact.kind === 'company' ? contact.companyName : `${contact.firstName} ${contact.lastName}`.trim();
}
