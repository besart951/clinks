import assert from 'node:assert/strict';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { contactRow, invoiceRow } from './fixtures.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
let filing: string;
const contactId = uuid();
beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('inbound@example.ch', 'Praxis Eingang');
	await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
	filing = (await call('POST', '/mail/filing-address')).body.filingAddress;
});
afterAll(async () => {
	await api?.stop();
});

const call = (method: string, path: string, body?: unknown) =>
	admin.browser.call(method, path, { token: admin.token, body });

/** A raw message as a mail server would deliver it into the catch-all mailbox. */
async function deliver(mail: ConstructorParameters<typeof MailComposer>[0]) {
	api.mailbox.deliver(await new MailComposer(mail).compile().build());
	return api.inbound.poll();
}

const filed = () => api.owner.selectFrom('mails').selectAll().orderBy('createdAt').execute();

describe('filing address', () => {
	it('is a random address on the inbound domain and can be replaced', async () => {
		assert.match(filing, /^ablage-[a-z0-9]{10}@in\.clinks\.test$/);
		const rotated = (await call('POST', '/mail/filing-address')).body.filingAddress;
		assert.notEqual(rotated, filing);
		assert.equal(await deliver({ from: 'lea@example.ch', to: filing, subject: 'alt', text: 'x' }), 1);
		assert.equal((await filed()).filter((mail) => mail.subject === 'alt').length, 0);
		filing = rotated;
	});

	it('files mail from a contact in the inbox at that contact, with attachments, once', async () => {
		const message = {
			from: 'Lea Muster <lea@example.ch>',
			to: 'praxis@praxis-eingang.ch',
			cc: filing,
			subject: 'Terminanfrage',
			text: 'Guten Tag, haben Sie am Freitag Zeit?',
			messageId: '<anfrage-1@example.ch>',
			attachments: [{ filename: 'befund.pdf', content: Buffer.from('%PDF-1.4 test'), contentType: 'application/pdf' }],
		};
		await deliver(message);
		await deliver(message);
		const rows = (await filed()).filter((mail) => mail.subject === 'Terminanfrage');
		assert.equal(rows.length, 1);
		assert.deepEqual([rows[0].folder, rows[0].contactId, rows[0].sender], ['inbox', contactId, 'lea@example.ch']);
		assert.match(String(rows[0].body), /Freitag Zeit/);
		const document = await api.owner
			.selectFrom('documents')
			.select(['name', 'targets', 'locked'])
			.where('name', '=', 'befund.pdf')
			.executeTakeFirstOrThrow();
		assert.deepEqual(document.targets, [{ kind: 'contact', id: contactId }]);
		assert.equal(document.locked, false);
		assert.equal(api.mailbox.size, 0);
	});

	it('files a BCC of the workspace’s own mail under «Gesendet» at the recipient', async () => {
		await deliver({
			from: 'inbound@example.ch',
			to: 'lea@example.ch',
			// BCC leaves no trace in the headers; the receiving server names the mailbox in Delivered-To.
			headers: { 'Delivered-To': filing },
			subject: 'Ihr Termin',
			text: 'Bis Freitag',
		});
		const [sent] = (await filed()).filter((mail) => mail.subject === 'Ihr Termin');
		assert.deepEqual([sent.folder, sent.contactId, sent.isRead], ['sent', contactId, true]);
	});

	it('drops mail to unknown addresses', async () => {
		await deliver({ from: 'spam@example.com', to: 'ablage-zzzzzzzzzz@in.clinks.test', subject: 'Spam', text: 'x' });
		assert.equal((await filed()).filter((mail) => mail.subject === 'Spam').length, 0);
		assert.equal(api.mailbox.size, 0);
	});
});

describe('bounces', () => {
	async function sendInvoice(to: string) {
		const id = uuid();
		await call('POST', '/sync/write', {
			ops: [{ op: 'PUT', table: 'invoices', id, data: invoiceRow(contactId, { status: 'open' }) }],
		});
		const sent = await call('POST', `/finance/invoices/${id}/send`, { to, method: 'attachment' });
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		return id;
	}

	it('marks a hard bounce undeliverable, at the contact too, and sends that address nothing more', async () => {
		const invoiceId = await sendInvoice('weg@example.ch');
		const mail = api.mailer.last('weg@example.ch');
		assert.match(mail.returnPath ?? '', /^b-[a-z2-7]{26}-[a-z2-7]{26}@in\.clinks\.test$/);

		// A soft bounce (mailbox full for now) changes nothing.
		await deliver({
			from: 'MAILER-DAEMON@mx.example.ch',
			to: mail.returnPath,
			subject: 'Delivery delayed',
			text: 'Status: 4.2.2 mailbox full',
		});
		assert.equal((await call('GET', `/finance/invoices/${invoiceId}/sends`)).body[0].delivery, 'sent');

		await deliver({
			from: 'MAILER-DAEMON@mx.example.ch',
			to: mail.returnPath,
			subject: 'Undelivered Mail Returned to Sender',
			text: 'This is the mail system.',
			attachments: [
				{
					contentType: 'message/delivery-status',
					content:
						'Reporting-MTA: dns; mx.example.ch\n\nFinal-Recipient: rfc822; weg@example.ch\nAction: failed\nStatus: 5.1.1\n',
				},
			],
		});
		assert.equal((await call('GET', `/finance/invoices/${invoiceId}/sends`)).body[0].delivery, 'bounced');
		const atContact = await api.owner
			.selectFrom('mails')
			.select('delivery')
			.where('recipients', '@>', JSON.stringify(['weg@example.ch']))
			.executeTakeFirstOrThrow();
		assert.equal(atContact.delivery, 'bounced');

		const before = api.mailer.sent.length;
		const second = await sendInvoice('Weg@Example.ch');
		assert.equal(api.mailer.sent.length, before);
		assert.equal((await call('GET', `/finance/invoices/${second}/sends`)).body[0].delivery, 'suppressed');
	});
});
