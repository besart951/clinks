import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { blankMerge, conflicting, initialMerge, mergeFields, mergePatch, mergeValue } from '../src/contact-merge.ts';
import type { Contact } from '../src/types.ts';

const contact = (overrides: Partial<Omit<Contact, 'id'>> & { id?: string }): Contact =>
	({
		id: 'c',
		tenantId: 't',
		revision: 1,
		createdAt: '',
		updatedAt: '',
		kind: 'person',
		firstName: 'Lea',
		lastName: 'Muster',
		companyName: '',
		email: '',
		phone: '',
		address: { street: '', houseNumber: '', zip: '', city: '' },
		birthDate: null,
		insurer: '',
		tags: [],
		notes: '',
		archived: false,
		...overrides,
	}) as Contact;

describe('contact merge', () => {
	const kept = contact({
		id: 'a',
		email: 'lea@example.ch',
		phone: '032 111 11 11',
		address: { street: 'Seeweg', houseNumber: '5', zip: '2502', city: 'Biel' },
		tags: ['Patient:in'],
		notes: 'Allergie: Nüsse',
	});
	const other = contact({
		id: 'b',
		email: 'lea.muster@example.ch',
		mobile: '079 222 22 22',
		insurer: 'Helsana',
		address: { street: 'Seeweg', houseNumber: '7', zip: '2502', city: 'Biel' },
		tags: ['Newsletter', 'Patient:in'],
		notes: 'Allergie: Nüsse',
	});

	it('starts from the kept contact and fills its empty fields from the other', () => {
		const values = initialMerge(kept, [other]);
		assert.equal(values.email, 'lea@example.ch');
		assert.equal(values.mobile, '079 222 22 22');
		assert.equal(values.insurer, 'Helsana');
		assert.equal(values.houseNumber, '5');
		assert.equal(values.notes, 'Allergie: Nüsse', 'the same note only once');
	});

	it('names the fields that need a decision', () => {
		assert.equal(conflicting(kept, other, 'email'), true);
		assert.equal(conflicting(kept, other, 'houseNumber'), true);
		assert.equal(conflicting(kept, other, 'street'), false, 'equal');
		assert.equal(conflicting(kept, other, 'insurer'), false, 'only one has it');
		assert.equal(mergeValue(other, 'zip'), '2502');
	});

	it('starts blank before any contact is chosen', () => {
		assert.deepEqual(Object.keys(blankMerge()), [...mergeFields]);
		assert.ok(Object.values(blankMerge()).every((value) => value === ''));
	});

	it('builds the update with the address from its parts and every tag', () => {
		const values = { ...initialMerge(kept, [other]), email: 'lea.muster@example.ch', birthDate: '' };
		const patch = mergePatch(values, [kept, other]);
		assert.equal(patch.email, 'lea.muster@example.ch');
		assert.deepEqual(patch.address, { street: 'Seeweg', houseNumber: '5', zip: '2502', city: 'Biel' });
		assert.deepEqual(patch.tags, ['Patient:in', 'Newsletter']);
		assert.equal(patch.birthDate, null);
		assert.equal(patch.ahvNumber, undefined);
	});
});
