import type { Contact, ContactKind } from '@clinks/domain/types';
import type { Draft } from '@clinks/contracts/repository';

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
