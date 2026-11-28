import assert from 'node:assert/strict';
import { it } from 'vitest';
import { visitNeedDays } from '../src/visit-needs.ts';
import { visitLabel } from '../src/contacts.ts';

it('includes the selected local dates across the spring time change', () => {
	assert.deepEqual(visitNeedDays({ startsOn: '2027-03-27', endsOn: '2027-03-30', weekdays: [1, 7] }), [
		'2027-03-28',
		'2027-03-29',
	]);
	assert.deepEqual(visitNeedDays({ startsOn: '2027-03-27', endsOn: '2028-03-27', weekdays: [1] }), []);
});
it('shows both the person and the activity without repeating old name-only titles', () => {
	const contact = { kind: 'person' as const, firstName: 'Lena', lastName: 'Muster', companyName: '' };
	assert.equal(visitLabel({ kind: 'spitex', title: 'Einkaufen' }, contact), 'Lena Muster · Einkaufen');
	assert.equal(visitLabel({ kind: 'spitex', title: 'Lena Muster' }, contact), 'Lena Muster');
});
