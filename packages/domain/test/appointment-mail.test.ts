import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { appointmentWhen, defaultAppointmentMail, mailable, reminderDue } from '../src/appointment-mail.ts';

const on = { ...defaultAppointmentMail, confirmation: true, reminder: true };
const lea = { email: 'lea@example.ch', archived: false, reminders: true };

describe('appointment mail', () => {
	it('mails only contacts with an address who want it, never for cancelled appointments', () => {
		const planned = { status: 'planned', kind: 'physio' } as const;
		assert.equal(mailable(planned, lea, on), true);
		assert.equal(mailable(planned, { ...lea, reminders: false }, on), false);
		assert.equal(mailable(planned, { ...lea, email: '' }, on), false);
		assert.equal(mailable(planned, null, on), false);
		assert.equal(mailable({ ...planned, status: 'cancelled' }, lea, on), false);
	});

	it('mails Spitex visits only when the workspace turned them on', () => {
		const visit = { status: 'planned', kind: 'spitex' } as const;
		assert.equal(mailable(visit, lea, on), false);
		assert.equal(mailable(visit, lea, { ...on, spitexVisits: true }), true);
	});

	it('is due the given hours before, across a change to summer time', () => {
		// Sunday 29 March 2026, 10:00 in Zurich (UTC+2 since 03:00 that night); 24 h before is 09:00 on Saturday.
		const due = reminderDue('2026-03-29T08:00:00.000Z', on)!;
		assert.equal(due.toISOString(), '2026-03-28T08:00:00.000Z');
		assert.equal(
			appointmentWhen({ start: due.toISOString(), arrivalWindow: null }, 'Europe/Zurich', 'de-CH').time,
			'09:00',
		);
		assert.equal(reminderDue('2026-03-29T08:00:00.000Z', { ...on, reminder: false }), null);
	});

	it('names date and time in the workspace’s zone, or the arrival window', () => {
		const when = appointmentWhen({ start: '2026-11-03T09:30:00.000Z', arrivalWindow: null }, 'Europe/Zurich', 'de-CH');
		assert.deepEqual(when, { date: 'Dienstag, 3. November 2026', time: '10:30', window: null });
		const visit = appointmentWhen(
			{ start: '2026-11-03T07:00:00.000Z', arrivalWindow: { from: '08:00', to: '10:00' } },
			'Europe/Zurich',
			'de-CH',
		);
		assert.deepEqual(visit.window, { from: '08:00', to: '10:00' });
		assert.equal(visit.time, null);
	});
});
