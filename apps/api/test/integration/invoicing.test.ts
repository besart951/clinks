import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('invoicing@example.ch', 'Rechnungen AG');
});
afterAll(async () => {
	await api?.stop();
});

const call = (method: string, path: string, body?: unknown) =>
	admin.browser.call(method, path, { token: admin.token, body });

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

describe('payment details', () => {
	it('keeps the QR-IBAN apart from the IBAN and validates both', async () => {
		assert.equal((await call('POST', '/tenant/settings', { qrIban: 'CH93 0076 2011 6238 5295 7' })).status, 400);
		assert.equal((await call('POST', '/tenant/settings', { iban: 'CH44 3199 9123 0008 8901 2' })).status, 400);
		assert.equal(
			(
				await call('POST', '/tenant/settings', {
					iban: 'CH93 0076 2011 6238 5295 7',
					qrIban: 'CH44 3199 9123 0008 8901 2',
					invoiceSettings: {
						paymentTermDays: 20,
						footer: 'Zahlbar ohne Abzug.',
						delivery: 'link',
						reminders: [{ days: 10, fee: 2000, text: '' }],
						defaultInterest: false,
					},
				})
			).status,
			204,
		);
		const tenant = (await call('GET', '/me')).body.tenants[0];
		assert.equal(tenant.qrIban, 'CH44 3199 9123 0008 8901 2');
		assert.equal(tenant.invoiceSettings.paymentTermDays, 20);
		assert.equal(tenant.invoiceSettings.reminders[0].fee, 2000);
	});

	it('stores the service period and refuses one that ends before it starts', async () => {
		const contactId = uuid();
		const [good, bad] = [uuid(), uuid()];
		assert.equal(
			(await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] }))
				.status,
			200,
		);
		const written = await call('POST', '/sync/write', {
			ops: [{ op: 'PUT', table: 'invoices', id: good, data: invoiceRow(contactId) }],
		});
		assert.equal(written.status, 200, JSON.stringify(written.body));
		const row = await api.owner
			.selectFrom('invoices')
			.select(['serviceFrom', 'serviceTo', 'number'])
			.where('id', '=', good)
			.executeTakeFirstOrThrow();
		assert.match(String(row.number), /^2026-\d{4}$/);
		assert.ok(row.serviceFrom && row.serviceTo);
		const refused = await call('POST', '/sync/write', {
			ops: [
				{
					op: 'PUT',
					table: 'invoices',
					id: bad,
					data: invoiceRow(contactId, { service_from: '2026-11-20', service_to: '2026-11-02' }),
				},
			],
		});
		assert.equal(refused.status, 400, JSON.stringify(refused.body));
	});
});
