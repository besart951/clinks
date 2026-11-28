import type { Contact } from './types.ts';

/** How a contact is named: a company by its name, a person by first and last name. */
export function contactName(contact: Pick<Contact, 'kind' | 'firstName' | 'lastName' | 'companyName'>): string {
	return contact.kind === 'company' ? contact.companyName : `${contact.firstName} ${contact.lastName}`.trim();
}

/** Old visits often have the client name as their whole title. */
export function visitLabel(
	visit: { kind: string; title: string },
	contact?: Parameters<typeof contactName>[0] | null,
): string {
	const name = contact && visit.kind === 'spitex' ? contactName(contact) : '';
	return name && name !== visit.title ? name + ' · ' + visit.title : visit.title;
}
