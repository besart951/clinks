import assert from 'node:assert/strict';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { contactRow } from './fixtures.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
const lea = uuid();
const away = uuid();
const settings = {
	confirmation: true,
	reminder: true,
	hoursBefore: 24,
	text: 'Bitte Badetuch mitnehmen.',
	spitexVisits: false,
};

beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('termine@example.ch', 'Praxis Termin');
	await call('POST', '/tenant/settings', {
		address: { street: 'Seeweg', houseNumber: '5', zip: '2502', city: 'Biel/Bienne' },
	});
	await write([
		{ op: 'PUT', table: 'contacts', id: lea, data: contactRow },
		{ op: 'PUT', table: 'contacts', id: away, data: { ...contactRow, email: 'keine@example.ch', reminders: 0 } },
	]);
	assert.equal((await call('POST', '/mail/appointment-settings', settings)).status, 204);
});
afterAll(async () => {
	await api?.stop();
});
beforeEach(() => {
	api.clock.offset = 0;
});

const call = (method: string, path: string, body?: unknown) =>
	admin.browser.call(method, path, { token: admin.token, body });
const write = (ops: unknown[]) =>
	call('POST', '/sync/write', { ops }).then((response) => {
		assert.equal(response.status, 200, JSON.stringify(response.body));
	});
const inDays = (days: number, hour = 9) => {
	const date = new Date(Date.now() + days * 86_400_000);
	date.setUTCHours(hour, 30, 0, 0);
	return date.toISOString();
};
const appointment = (contactId: string, start: string, overrides: Record<string, unknown> = {}) => ({
	title: 'Physiotherapie Rücken',
	kind: 'physio',
	status: 'planned',
	contact_id: contactId,
	assignee_id: null,
	starts_at: start,
	ends_at: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
	location: '',
	notes: 'Diagnose: Lumbago',
	service: 'general',
	...overrides,
});
/** The worker's round: due reminders into the outbox, then out. */
const remind = async () => {
	await api.appointmentReminders.dispatch();
	await api.mailWorker.drain();
};
const mailsTo = (address: string) => api.mailer.sent.filter((mail) => mail.to === address);
const reminderOf = (id: string) =>
	api.owner.selectFrom('auth.appointmentReminders').selectAll().where('appointmentId', '=', id).executeTakeFirst();

describe('appointment mail', () => {
	it('confirms a new appointment with date, time and address only — never what it is for', async () => {
		const id = uuid();
		const before = mailsTo('lea@example.ch').length;
		await write([{ op: 'PUT', table: 'appointments', id, data: appointment(lea, '2026-12-08T09:30:00.000Z') }]);
		const mail = mailsTo('lea@example.ch').at(-1)!;
		assert.equal(mailsTo('lea@example.ch').length, before + 1);
		assert.equal(mail.subject, 'Terminbestätigung: Dienstag, 8. Dezember 2026');
		assert.match(mail.text, /Dienstag, 8\. Dezember 2026 um 10:30 Uhr\nSeeweg 5, 2502 Biel\/Bienne/);
		assert.match(mail.text, /Bitte Badetuch mitnehmen\./);
		assert.match(mail.text, /Antworten Sie einfach auf diese Mail/);
		assert.doesNotMatch(`${mail.subject} ${mail.text} ${mail.html}`, /Physiotherapie|Rücken|Lumbago|general/);
		const due = (await reminderOf(id))!.dueAt;
		assert.equal(due.toISOString(), '2026-12-07T09:30:00.000Z');
	});

	it('confirms again when moved, and queues the reminder for the new time', async () => {
		const id = uuid();
		await write([{ op: 'PUT', table: 'appointments', id, data: appointment(lea, inDays(5)) }]);
		const sent = mailsTo('lea@example.ch').length;
		await write([{ op: 'PATCH', table: 'appointments', id, data: { notes: 'Nur eine Notiz' } }]);
		assert.equal(mailsTo('lea@example.ch').length, sent, 'no mail for other changes');
		const moved = inDays(6);
		await write([{ op: 'PATCH', table: 'appointments', id, data: { starts_at: moved, ends_at: inDays(6, 10) } }]);
		assert.equal(mailsTo('lea@example.ch').length, sent + 1);
		assert.equal((await reminderOf(id))!.dueAt.getTime(), Date.parse(moved) - 24 * 3_600_000);
	});

	it('reminds once when due; a move clears it so the new time is reminded again', async () => {
		const id = uuid();
		const start = inDays(3);
		await write([{ op: 'PUT', table: 'appointments', id, data: appointment(lea, start) }]);
		api.clock.offset = Date.parse(start) - Date.now() - 23 * 3_600_000;
		const before = mailsTo('lea@example.ch').length;
		await remind();
		const reminder = mailsTo('lea@example.ch').at(-1)!;
		assert.equal(mailsTo('lea@example.ch').length, before + 1);
		assert.match(reminder.subject, /^Erinnerung: Ihr Termin am /);
		assert.doesNotMatch(reminder.text, /Physiotherapie|Lumbago/);
		const row = await api.owner
			.selectFrom('appointments')
			.select('remindedAt')
			.where('id', '=', id)
			.executeTakeFirstOrThrow();
		assert.ok(row.remindedAt);
		await remind();
		assert.equal(mailsTo('lea@example.ch').length, before + 1, 'only once');

		api.clock.offset = 0; // the access token would have expired in two days
		await write([{ op: 'PATCH', table: 'appointments', id, data: { starts_at: inDays(4), ends_at: inDays(4, 10) } }]);
		const cleared = await api.owner
			.selectFrom('appointments')
			.select('remindedAt')
			.where('id', '=', id)
			.executeTakeFirstOrThrow();
		assert.equal(cleared.remindedAt, null);
		assert.ok(await reminderOf(id));
	});

	it('skips cancelled appointments and contacts who do not want reminders', async () => {
		const cancelled = uuid();
		const optedOut = uuid();
		const before = api.mailer.sent.length;
		await write([
			{ op: 'PUT', table: 'appointments', id: optedOut, data: appointment(away, inDays(5)) },
			{ op: 'PUT', table: 'appointments', id: cancelled, data: appointment(lea, inDays(5, 11)) },
		]);
		assert.equal(mailsTo('keine@example.ch').length, 0);
		assert.equal(await reminderOf(optedOut), undefined);
		await write([{ op: 'PATCH', table: 'appointments', id: cancelled, data: { status: 'cancelled' } }]);
		assert.equal(await reminderOf(cancelled), undefined);
		assert.equal(api.mailer.sent.length, before + 1, 'only the confirmation before it was cancelled');
	});

	it('mails Spitex visits only when turned on: reminders with the arrival window, once the week is released', async () => {
		const visit = uuid();
		const start = inDays(3, 7);
		const data = appointment(lea, start, {
			kind: 'spitex',
			service: 'basic_care',
			arrival_window: '{"from":"08:00","to":"10:00"}',
		});
		await write([{ op: 'PUT', table: 'appointments', id: visit, data }]);
		assert.equal(await reminderOf(visit), undefined, 'off by default');

		await call('POST', '/mail/appointment-settings', { ...settings, spitexVisits: true });
		const before = mailsTo('lea@example.ch').length;
		const second = uuid();
		await write([{ op: 'PUT', table: 'appointments', id: second, data }]);
		assert.equal(mailsTo('lea@example.ch').length, before, 'no confirmation for visits');
		assert.ok(await reminderOf(visit), 'the settings put upcoming visits on the schedule');

		api.clock.offset = Date.parse(start) - Date.now() - 23 * 3_600_000;
		await remind();
		assert.equal(mailsTo('lea@example.ch').length, before, 'the week is not released yet');
		// The planner releases the week (Monday in Zurich); the reminder is queued again by the next save.
		api.clock.offset = 0;
		const local = new Date(new Date(start).toLocaleString('en-US', { timeZone: 'Europe/Zurich' }));
		local.setDate(local.getDate() - ((local.getDay() + 6) % 7));
		const weekStart = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
		const me = (await call('GET', '/me')).body.user.id;
		await write([
			{ op: 'PUT', table: 'spitex_week_releases', id: uuid(), data: { week_start: weekStart, released_by: me } },
		]);
		await write([{ op: 'PATCH', table: 'appointments', id: second, data: { location: 'Hauseingang links' } }]);
		api.clock.offset = Date.parse(start) - Date.now() - 23 * 3_600_000;
		await remind();
		const reminder = mailsTo('lea@example.ch').at(-1)!;
		assert.match(reminder.text, /Ankunft zwischen 08:00 und 10:00 Uhr/);
		assert.doesNotMatch(reminder.text, /Grundpflege|basic_care|Physiotherapie/);
	});

	it('removes the reminders when they are turned off', async () => {
		const id = uuid();
		await write([{ op: 'PUT', table: 'appointments', id, data: appointment(lea, inDays(8)) }]);
		assert.ok(await reminderOf(id));
		await call('POST', '/mail/appointment-settings', { ...settings, reminder: false });
		assert.equal(await reminderOf(id), undefined);
		assert.deepEqual((await call('GET', '/mail/appointment-settings')).body, { ...settings, reminder: false });
	});
});
