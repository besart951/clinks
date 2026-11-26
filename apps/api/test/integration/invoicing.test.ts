import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

describe('archive', () => {
	it('archives the PDF/A once when the invoice is issued and keeps it from changing', async () => {
		const contactId = uuid();
		const id = uuid();
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'invoices', id, data: invoiceRow(contactId) }] });
		assert.equal((await call('GET', `/finance/invoices/${id}/pdf`)).status, 404);

		const issued = await call('POST', '/sync/write', {
			ops: [{ op: 'PATCH', table: 'invoices', id, data: { status: 'open', document_id: uuid() } }],
		});
		assert.equal(issued.status, 200, JSON.stringify(issued.body));
		const invoice = await api.owner
			.selectFrom('invoices')
			.select(['documentId', 'pdfSha256', 'number'])
			.where('id', '=', id)
			.executeTakeFirstOrThrow();
		assert.match(String(invoice.pdfSha256), /^[0-9a-f]{64}$/);
		const document = await api.owner
			.selectFrom('documents')
			.selectAll()
			.where('id', '=', String(invoice.documentId))
			.executeTakeFirstOrThrow();
		assert.equal(document.locked, true);
		assert.equal(document.mimeType, 'application/pdf');
		assert.equal(document.name, `Rechnung ${invoice.number}.pdf`);
		assert.deepEqual(document.targets, [{ kind: 'invoice', id }]);

		const pdf = await call('GET', `/finance/invoices/${id}/pdf`);
		assert.equal(pdf.status, 200);
		assert.match(pdf.body.url, /^(data:application\/pdf;base64,|https?:)/);

		// Issued: no changes to what it bills, no deleting, the file stays.
		const patch = (data: Record<string, unknown>) =>
			call('POST', '/sync/write', { ops: [{ op: 'PATCH', table: 'invoices', id, data }] });
		assert.equal((await patch({ notes: 'später' })).status, 400);
		assert.equal((await patch({ status: 'draft' })).status, 400);
		assert.equal((await call('POST', '/sync/write', { ops: [{ op: 'DELETE', table: 'invoices', id }] })).status, 400);
		assert.equal(
			(await call('POST', '/sync/write', { ops: [{ op: 'DELETE', table: 'documents', id: document.id }] })).status,
			400,
		);
		// Payments and cancelling still go.
		assert.equal((await patch({ payments: JSON.stringify([{ date: '2026-12-01', amount: 1000 }]) })).status, 200);
		const after = await api.owner
			.selectFrom('invoices')
			.select(['documentId', 'pdfSha256'])
			.where('id', '=', id)
			.executeTakeFirstOrThrow();
		assert.deepEqual(after, { documentId: invoice.documentId, pdfSha256: invoice.pdfSha256 });
	});
});

describe('sending', () => {
	async function issued() {
		const contactId = uuid();
		const id = uuid();
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
		await call('POST', '/sync/write', {
			ops: [{ op: 'PUT', table: 'invoices', id, data: invoiceRow(contactId, { status: 'open' }) }],
		});
		const { number } = await api.owner
			.selectFrom('invoices')
			.select('number')
			.where('id', '=', id)
			.executeTakeFirstOrThrow();
		return { id, number: String(number) };
	}

	it('attaches the archived PDF in the workspace’s name and logs the mail', async () => {
		const { id, number } = await issued();
		const sent = await call('POST', `/finance/invoices/${id}/send`, { to: 'kunde@example.ch', method: 'attachment' });
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		assert.equal(sent.body.method, 'attachment');
		assert.equal(sent.body.linkExpiresAt, null);
		const mail = api.mailer.last('kunde@example.ch');
		assert.equal(mail.fromName, 'Rechnungen AG');
		assert.equal(mail.replyTo, 'invoicing@example.ch');
		assert.equal(mail.subject, `Rechnung ${number} von Rechnungen AG`);
		assert.equal(mail.attachments?.length, 1);
		assert.equal(mail.attachments![0].filename, `Rechnung ${number}.pdf`);
		assert.equal(Buffer.from(mail.attachments![0].content).subarray(0, 8).toString(), '%PDF-1.7');

		const log = await call('GET', `/finance/invoices/${id}/sends`);
		assert.equal(log.body.length, 1);
		assert.equal(log.body[0].recipient, 'kunde@example.ch');
		const entry = await api.owner
			.selectFrom('audit')
			.select('action')
			.where('target', '=', id)
			.where('action', '=', 'invoice.sent')
			.executeTakeFirst();
		assert.ok(entry);
	});

	it('sends a secure link that opens only with the postcode and counts the openings', async () => {
		const { id, number } = await issued();
		const sent = await call('POST', `/finance/invoices/${id}/send`, { to: 'lea@example.ch', method: 'link' });
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		const mail = api.mailer.last('lea@example.ch');
		assert.equal(mail.attachments, undefined);
		// No amount and no service in the mail, only who and which invoice.
		assert.doesNotMatch(mail.text, /Beratung|240|CHF/);
		const token = decodeURIComponent(/invoice-link\/([A-Za-z0-9_%-]+)/.exec(mail.text)![1]);
		const anonymous = (method: string, body?: unknown) =>
			admin.browser.call(method, `/invoice-links/${encodeURIComponent(token)}`, { token: null, body });

		const details = await anonymous('GET');
		assert.equal(details.status, 200);
		assert.equal(details.body.tenantName, 'Rechnungen AG');
		assert.equal(details.body.number, number);
		assert.equal('url' in details.body, false);

		assert.equal((await anonymous('POST', { postcode: '8000' })).status, 400);
		const opened = await anonymous('POST', { postcode: 'CH-3000' });
		assert.equal(opened.status, 200, JSON.stringify(opened.body));
		assert.equal(opened.body.name, `Rechnung ${number}.pdf`);
		await anonymous('POST', { postcode: '3000' });
		const [entry] = (await call('GET', `/finance/invoices/${id}/sends`)).body;
		assert.equal(entry.openCount, 2);
		assert.ok(entry.openedAt);
		assert.ok(new Date(entry.linkExpiresAt).getTime() > Date.now() + 89 * 24 * 60 * 60_000);

		// Five wrong postcodes end the link, even for the right one afterwards.
		for (let attempt = 0; attempt < 4; attempt++) await anonymous('POST', { postcode: '0000' });
		assert.equal((await anonymous('POST', { postcode: '3000' })).status, 410);
		assert.equal((await admin.browser.call('GET', '/invoice-links/not-a-real-token-at-all', {})).status, 404);
	});

	it('sends nothing for drafts, without the finance right or across workspaces', async () => {
		const contactId = uuid();
		const draft = uuid();
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
		await call('POST', '/sync/write', {
			ops: [{ op: 'PUT', table: 'invoices', id: draft, data: invoiceRow(contactId) }],
		});
		const input = { to: 'kunde@example.ch', method: 'attachment' };
		assert.equal((await call('POST', `/finance/invoices/${draft}/send`, input)).status, 400);
		const { id } = await issued();
		const other = await api.administrator('other-sender@example.ch', 'Andere AG');
		const foreign = await other.browser.call('POST', `/finance/invoices/${id}/send`, {
			token: other.token,
			body: input,
		});
		assert.equal(foreign.status, 404);
		assert.equal(
			(await other.browser.call('GET', `/finance/invoices/${id}/sends`, { token: other.token })).body.length,
			0,
		);
	});
});

describe('reminders', () => {
	it('sends the next level once it is due, archives its PDF and records the fee', async () => {
		const settings = {
			paymentTermDays: 30,
			footer: '',
			delivery: 'attachment',
			reminders: [
				{ days: 10, fee: 500, text: '' },
				{ days: 10, fee: 1000, text: '' },
			],
			defaultInterest: true,
		};
		assert.equal((await call('POST', '/tenant/settings', { invoiceSettings: settings })).status, 204);
		const contactId = uuid();
		const id = uuid();
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
		const overdue = invoiceRow(contactId, { status: 'open', issue_date: '2026-01-05', due_date: '2026-02-04' });
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'invoices', id, data: overdue }] });
		// Clients cannot set the level or forge reminders.
		await call('POST', '/sync/write', {
			ops: [{ op: 'PATCH', table: 'invoices', id, data: { reminder_level: 3, reminders: '[{"level":9}]' } }],
		});

		const sent = await call('POST', `/finance/invoices/${id}/remind`, { to: 'lea@example.ch', method: 'attachment' });
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		assert.deepEqual([sent.body.kind, sent.body.level], ['reminder', 1]);
		const invoice = await api.owner
			.selectFrom('invoices')
			.select(['number', 'reminderLevel', 'reminders'])
			.where('id', '=', id)
			.executeTakeFirstOrThrow();
		assert.equal(invoice.reminderLevel, 1);
		const [reminder] = invoice.reminders as { level: number; fee: number; documentId: string; dueDate: string }[];
		assert.equal(reminder.level, 1);
		assert.equal(reminder.fee, 500);
		const document = await api.owner
			.selectFrom('documents')
			.select(['name', 'locked'])
			.where('id', '=', reminder.documentId)
			.executeTakeFirstOrThrow();
		assert.deepEqual(document, { name: `1. Mahnung ${invoice.number}.pdf`, locked: true });
		const mail = api.mailer.last('lea@example.ch');
		assert.equal(mail.subject, `1. Mahnung zur Rechnung ${invoice.number} von Rechnungen AG`);
		assert.equal(mail.attachments?.[0].filename, document.name);

		// Level 2 waits for the first reminder's deadline.
		const early = await call('POST', `/finance/invoices/${id}/remind`, { to: 'lea@example.ch', method: 'attachment' });
		assert.equal(early.status, 400);
		assert.equal(early.body.error.code, 'error.ws.reminder_not_due');
		// The list of sent reminders only grows.
		await assert.rejects(
			api.owner.updateTable('invoices').set({ reminders: '[]' }).where('id', '=', id).execute(),
			/sent reminders cannot be changed/,
		);
	});
});

describe('bank files', () => {
	it('books credits by reference, keeps the rest to assign and never books a file twice', async () => {
		const contactId = uuid();
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
		const issue = async () => {
			const id = uuid();
			await call('POST', '/sync/write', {
				ops: [{ op: 'PUT', table: 'invoices', id, data: invoiceRow(contactId, { status: 'open' }) }],
			});
			const row = await api.owner
				.selectFrom('invoices')
				.select('number')
				.where('id', '=', id)
				.executeTakeFirstOrThrow();
			return { id, number: String(row.number) };
		};
		const byQr = await issue();
		const byScor = await issue();
		const byHand = await issue();
		const { qrReference, creditorReference } = await import('@clinks/domain/qr-bill');
		const fixture = await readFile(
			new URL('../../../../packages/domain/test/fixtures/camt054.xml', import.meta.url),
			'utf8',
		);
		const content = fixture
			.replace('00 00000 00000 00000 02026 00427', qrReference(byQr.number))
			.replace('RF61 2026 0043', creditorReference(byScor.number))
			// The invoice is CHF 259.25; one partial payment by QR, CHF 50 by SCOR, the rest by hand.
			.replace('129.70', '100.00');

		const first = await call('POST', '/finance/bank-imports', { fileName: 'camt054-dezember.xml', content });
		assert.equal(first.status, 201, JSON.stringify(first.body));
		assert.deepEqual(
			[first.body.kind, first.body.credits, first.body.booked, first.body.duplicates],
			['camt.054', 3, 2, 0],
		);
		const payments = async (id: string) =>
			(await api.owner.selectFrom('invoices').select('payments').where('id', '=', id).executeTakeFirstOrThrow())
				.payments as { amount: number; date: string; entryId?: string }[];
		assert.deepEqual(
			(await payments(byQr.id)).map((payment) => [payment.amount, payment.date]),
			[[10000, '2026-12-05']],
		);
		assert.equal((await payments(byScor.id))[0].amount, 5000);

		// The same file again books nothing; a file with the same entries under another name neither.
		const again = await call('POST', '/finance/bank-imports', { fileName: 'nochmals.xml', content });
		assert.equal(again.body.repeated, true);
		const renamed = await call('POST', '/finance/bank-imports', { fileName: 'kopie.xml', content: `${content}\n` });
		assert.deepEqual([renamed.body.booked, renamed.body.duplicates], [0, 3]);
		assert.equal((await payments(byQr.id)).length, 1);

		const open = await call('GET', '/finance/bank-entries');
		assert.equal(open.body.length, 1);
		const [entry] = open.body;
		assert.deepEqual([entry.amount, entry.debtor, entry.info], [28045, 'Bruno Häfliger & Co', 'Rechnung vom November']);
		assert.equal(
			(await call('POST', `/finance/bank-entries/${entry.id}/assign`, { invoiceId: byHand.id })).status,
			204,
		);
		assert.equal((await payments(byHand.id))[0].entryId, entry.id);
		assert.equal((await call('POST', `/finance/bank-entries/${entry.id}/ignore`)).status, 409);
		assert.equal((await call('GET', '/finance/bank-entries')).body.length, 0);

		const document = await api.owner
			.selectFrom('documents')
			.select(['locked', 'mimeType'])
			.where('name', '=', 'camt054-dezember.xml')
			.executeTakeFirstOrThrow();
		assert.deepEqual(document, { locked: true, mimeType: 'application/xml' });
		assert.equal((await call('POST', '/finance/bank-imports', { fileName: 'x.xml', content: '<a/>' })).status, 400);
		assert.equal((await call('GET', '/finance/bank-imports')).body.length, 2);
	});
});
