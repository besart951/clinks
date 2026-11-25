import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { InlineEditor, maskValue } from '@clinks/ui/kit/inline-edit';
import { addressField, contactPatch } from '../src/lib/features/contacts/contact-fields.ts';
import { validAhv } from '../src/lib/features/physio/patient-fields.ts';
import { badgeCounts } from '../src/lib/features/shell/nav-badges.svelte.ts';
import { visitWeekdays } from '../src/lib/features/spitex/clients.svelte.ts';
import { ageOn } from '@clinks/domain/dates';

describe('inline editor', () => {
	it('saves a changed value and leaves edit mode', async () => {
		const saved: string[] = [];
		const editor = new InlineEditor((value) => {
			saved.push(value);
			return true;
		});
		editor.start('Bern');
		editor.draft = '  Biel ';
		assert.equal(await editor.commit(), true);
		assert.deepEqual(saved, ['Biel']);
		assert.equal(editor.editing, false);
	});

	it('does not save an unchanged value', async () => {
		let calls = 0;
		const editor = new InlineEditor(() => calls++);
		editor.start('Bern');
		assert.equal(await editor.commit(), true);
		assert.equal(calls, 0);
	});

	it('stays in edit mode when validation or the save fails', async () => {
		const invalid = new InlineEditor(
			() => true,
			(value) => (value ? null : 'required'),
		);
		invalid.start('x');
		invalid.draft = '';
		assert.equal(await invalid.commit(), false);
		assert.equal(invalid.error, 'required');
		assert.equal(invalid.editing, true);

		const failing = new InlineEditor(() => null);
		failing.start('a');
		failing.draft = 'b';
		assert.equal(await failing.commit(), false);
		assert.equal(failing.editing, true);
	});

	it('restores the original on Escape', () => {
		const editor = new InlineEditor(() => true);
		editor.start('Bern');
		editor.draft = 'Zürich';
		editor.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} } as KeyboardEvent);
		assert.equal(editor.editing, false);
		assert.equal(editor.draft, 'Bern');
	});

	it('masks identifiers but keeps separators and the last digits', () => {
		assert.equal(maskValue('756.1234.5678.97'), '•••.••••.••••.97');
	});
});

describe('contact fields', () => {
	it('edits the address as street, house number, postal code and city', () => {
		const text = { t: (key: string) => key, date: String };
		const field = addressField({ street: 'Kramgasse', houseNumber: '41', zip: '3011', city: 'Bern' }, text);
		assert.equal(field.display, 'Kramgasse 41, 3011 Bern');
		assert.deepEqual(
			field.parts?.map((part) => part.key),
			['street', 'houseNumber', 'zip', 'city'],
		);
		assert.equal(field.validate?.(JSON.stringify({ zip: '30' })), 'error.ws.invalid_zip');
		assert.equal(field.validate?.(field.value), null);
	});

	it('turns edited rows into patches', () => {
		assert.deepEqual(contactPatch('birthDate', ''), { birthDate: null });
		assert.deepEqual(contactPatch('phone', '079 1'), { phone: '079 1' });
		assert.deepEqual(
			contactPatch('address', JSON.stringify({ street: ' Weg ', houseNumber: '2', zip: '2500', city: 'Biel' })).address,
			{
				street: 'Weg',
				houseNumber: '2',
				zip: '2500',
				city: 'Biel',
			},
		);
		// A number left in the street moves to the house number.
		assert.equal(
			contactPatch('address', JSON.stringify({ street: 'Weg 2', zip: '', city: '' })).address?.houseNumber,
			'2',
		);
	});

	it('validates AHV numbers and computes ages', () => {
		assert.equal(validAhv('756.1234.5678.97'), true);
		assert.equal(validAhv('756.1234'), false);
		assert.equal(ageOn('1968-03-14', '2026-03-13'), 57);
		assert.equal(ageOn('1968-03-14', '2026-03-14'), 58);
	});
});

describe('sidebar badges', () => {
	it('counts late tasks, unread mail, overdue invoices and unbilled patients', () => {
		const now = new Date('2026-11-21T10:00:00Z');
		const me = 'u1' as never;
		const badges = badgeCounts(
			{
				tasks: [
					{ status: 'todo', assigneeIds: [me], dueDate: '2026-11-01' },
					{ status: 'todo', assigneeIds: [me], dueDate: null },
					{ status: 'done', assigneeIds: [me], dueDate: '2026-11-01' },
				] as never,
				mails: [
					{ folder: 'inbox', read: false },
					{ folder: 'sent', read: false },
				] as never,
				invoices: [],
				appointments: [
					{ kind: 'physio', status: 'done', billedInvoiceId: null, contactId: 'c1' },
					{ kind: 'physio', status: 'done', billedInvoiceId: null, contactId: 'c1' },
					{ kind: 'spitex', assigneeId: null, start: '2026-11-22T08:00:00.000Z' },
				] as never,
			},
			me,
			now,
		);
		assert.deepEqual(badges['/planner'], { count: 1, tone: 'attention' });
		assert.deepEqual(badges['/mail'], { count: 1, tone: 'info' });
		assert.deepEqual(badges['/physio'], { count: 1, tone: 'attention' });
		assert.deepEqual(badges['/spitex'], { count: 1, tone: 'attention' });
		assert.equal(badges['/finance'], undefined);
	});

	it('marks the weekdays with visits, Monday first', () => {
		const days = visitWeekdays([{ start: '2026-11-16T09:00:00' }, { start: '2026-11-22T09:00:00' }] as never);
		assert.deepEqual(days, [true, false, false, false, false, false, true]);
	});
});
