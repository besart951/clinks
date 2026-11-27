/** Sync rows tests write through `/sync/write`: a person with an address, and an invoice for them. */
export const contactRow = {
	kind: 'person',
	first_name: 'Lea',
	last_name: 'Muster',
	company_name: '',
	email: 'lea@example.ch',
	phone: '',
	address: JSON.stringify({ street: 'Weg', houseNumber: '1', zip: '3000', city: 'Bern' }),
	birth_date: null,
	insurer: '',
	tags: '[]',
	notes: '',
	archived: 0,
};

export const invoiceRow = (contactId: string, overrides: Record<string, unknown> = {}) => ({
	number: '',
	kind: 'invoice',
	contact_id: contactId,
	issue_date: '2026-11-22',
	due_date: '2026-12-22',
	status: 'draft',
	lines: JSON.stringify([{ description: 'Beratung', quantity: 2, unitPrice: 12000, vatRate: 810 }]),
	payments: '[]',
	reminder_level: 0,
	notes: '',
	appointment_ids: '[]',
	service_from: '2026-11-02',
	service_to: '2026-11-20',
	...overrides,
});
