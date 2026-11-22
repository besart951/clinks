import type { Contact, ContactKind } from '../../domain/types.ts';
import type { Draft } from '../../data/repository.ts';

export function emptyContact(kind: ContactKind = 'person'): Draft<Contact> {
	return {
		kind,
		firstName: '',
		lastName: '',
		companyName: '',
		email: '',
		phone: '',
		address: { street: '', zip: '', city: '' },
		birthDate: null,
		insurer: '',
		tags: [],
		notes: '',
		archived: false,
	};
}
