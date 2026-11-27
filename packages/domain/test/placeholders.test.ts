import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { fillPlaceholders } from '../src/placeholders.ts';

describe('placeholders', () => {
	const lea = { kind: 'person', firstName: 'Lea', lastName: 'Graf', companyName: '' } as const;

	it('fills them per recipient', () => {
		assert.equal(
			fillPlaceholders('Hallo {vorname} {nachname} – {firma}, {anrede}', lea, 'Stille'),
			'Hallo Lea Graf – Stille, Lea Graf',
		);
	});

	it('greets a company by its name and leaves them empty without a contact', () => {
		const company = { kind: 'company', firstName: '', lastName: '', companyName: 'Muster AG' } as const;
		assert.equal(fillPlaceholders('Guten Tag {anrede}', company, 'Stille'), 'Guten Tag Muster AG');
		assert.equal(fillPlaceholders('Hallo {vorname}, {firma}', null, 'Stille'), 'Hallo , Stille');
	});

	it('keeps braces that are no placeholder', () => {
		assert.equal(fillPlaceholders('{unbekannt} {VORNAME}', lea, 'Stille'), '{unbekannt} {VORNAME}');
	});
});
