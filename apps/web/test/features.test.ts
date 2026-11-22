import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { contactsFromCsv, duplicateKey, parseCsv } from '../src/lib/features/contacts/csv.ts';
import { campaignChecks, fillPlaceholders } from '../src/lib/features/mail/templates.ts';
import { buildReport } from '../src/lib/features/finance/reports.svelte.ts';
import { prescriptionProgress } from '../src/lib/features/physio/physio.svelte.ts';
import { mentionedPeople } from '../src/lib/features/collaboration/comments.svelte.ts';
import { bundleFor, interpolate } from '@clinks/i18n-types/catalog';

describe('contacts import', () => {
	it('parses semicolon CSV with quotes and German headers', () => {
		const rows = parseCsv('Vorname;Nachname;E-Mail;Ort\n"Lea";"Graf; jun.";lea@example.ch;Biel\n');
		const [contact] = contactsFromCsv(rows);
		assert.equal(contact.lastName, 'Graf; jun.');
		assert.equal(contact.address.city, 'Biel');
		assert.deepEqual(contact.tags, ['Import']);
	});

	it('recognises duplicates by email or by name and city', () => {
		const base = {
			email: '',
			firstName: 'Anna',
			lastName: 'Meier',
			companyName: '',
			address: { street: '', zip: '', city: 'Lyss' },
		};
		assert.equal(duplicateKey(base), duplicateKey({ ...base, firstName: 'anna' }));
		assert.equal(duplicateKey({ ...base, email: 'A@x.ch' }), 'a@x.ch');
	});
});

describe('mail', () => {
	it('fills placeholders per recipient', () => {
		const text = fillPlaceholders(
			'Hallo {vorname} {nachname} – {firma}',
			{ kind: 'person', firstName: 'Lea', lastName: 'Graf', companyName: '' },
			'Stille',
		);
		assert.equal(text, 'Hallo Lea Graf – Stille');
	});

	it('blocks campaigns without subject or recipients and warns about spam words', () => {
		const checks = campaignChecks({ subject: '', previewText: '', body: 'GRATIS!!', audienceTag: '' }, 0);
		assert.ok(checks.some((check) => check.key.endsWith('subject_missing') && check.level === 'error'));
		assert.ok(checks.some((check) => check.key.endsWith('no_recipients') && check.level === 'error'));
		assert.ok(checks.some((check) => check.key.endsWith('spam')));
	});
});

describe('finance report', () => {
	it('splits receivables by age and computes the VAT payable', () => {
		const invoice = (id: string, dueDate: string, vatRate: 810 | 0) => ({
			id,
			number: id,
			status: 'open',
			issueDate: '2026-10-05',
			dueDate,
			reminderLevel: 0,
			payments: [],
			lines: [{ description: 'x', quantity: 1, unitPrice: 10000, vatRate }],
		});
		const report = buildReport(
			[invoice('a', '2026-11-30', 810), invoice('b', '2026-10-25', 0)] as never,
			[{ date: '2026-10-10', amount: 10810, vatRate: 810, category: 'material' }] as never,
			'2026-11-21',
		);
		assert.deepEqual(
			report.aging.map((bucket) => bucket.count),
			[1, 1, 0, 0],
		);
		assert.equal(report.quarter.output[0].vat, 810);
		assert.equal(report.quarter.input, 810);
		assert.equal(report.quarter.payable, 0);
		assert.equal(report.months.length, 12);
	});
});

describe('physio', () => {
	it('counts used sessions and warns when few are left', () => {
		const prescription = {
			contactId: 'p',
			issuedOn: '2026-11-01',
			validUntil: '2026-12-31',
			sessionsPrescribed: 3,
		} as never;
		const visit = (date: string) => ({
			contactId: 'p',
			kind: 'physio',
			status: 'done',
			start: `${date}T08:00:00.000Z`,
		});
		const progress = prescriptionProgress(
			prescription,
			[visit('2026-11-03'), visit('2026-11-10'), visit('2026-10-01')] as never,
			'2026-11-21',
		);
		assert.equal(progress.used, 2);
		assert.equal(progress.alert, 'almost_used');
	});
});

describe('collaboration and i18n', () => {
	it('finds mentioned people by name', () => {
		const people = [
			{ id: 'u1', name: 'Sandra Roth' },
			{ id: 'u2', name: 'Marco Bianchi' },
		] as never;
		assert.deepEqual(mentionedPeople('Bitte @Sandra Roth prüfen', people), ['u1']);
	});

	it('resolves the catalog in both languages and interpolates parameters', () => {
		assert.equal(bundleFor('de-CH').get('ui.ws.module.spitex'), 'Spitex');
		assert.equal(bundleFor('en-US').get('ui.ws.module.spitex'), 'Home care');
		assert.equal(interpolate('{count} offen', { count: 3 }), '3 offen');
	});
});
