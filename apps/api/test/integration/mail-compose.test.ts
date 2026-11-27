import assert from 'node:assert/strict';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { contactRow } from './fixtures.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
const contactId = uuid();
beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('compose@example.ch', 'Praxis Post');
	await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
});
afterAll(async () => {
	await api?.stop();
});

const call = (method: string, path: string, body?: unknown, token = admin.token) =>
	admin.browser.call(method, path, { token, body });

const send = (input: Record<string, unknown>, token = admin.token) =>
	call('POST', '/mail/send', { senderId: null, attachmentIds: [], replyToId: null, draftId: null, ...input }, token);

describe('sending from the mail module', () => {
	it('sends each recipient their own mail with the placeholders filled, filed under «Gesendet»', async () => {
		const sent = await send({
			to: ['lea@example.ch', 'unbekannt@example.ch'],
			subject: 'Termin für {vorname}',
			body: 'Guten Tag {anrede}\n\nIhr Termin ist bestätigt.\n\n{firma}',
		});
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		assert.equal(sent.body.queued, 2);
		assert.deepEqual([sent.body.suppressed, sent.body.outboxIds.length, sent.body.undoUntil], [[], 2, null]);
		const lea = api.mailer.last('lea@example.ch');
		assert.equal(lea.subject, 'Termin für Lea');
		assert.match(lea.text, /^Guten Tag Lea Muster\n\nIhr Termin ist bestätigt\.\n\nPraxis Post/);
		assert.deepEqual([lea.fromName, lea.replyTo], ['Test Person', 'compose@example.ch']);
		assert.equal(api.mailer.last('unbekannt@example.ch').subject, 'Termin für ');
		const filed = await api.owner
			.selectFrom('mails')
			.select(['folder', 'contactId', 'delivery', 'recipients'])
			.where('subject', 'like', 'Termin für%')
			.orderBy('contactId')
			.execute();
		assert.deepEqual(
			filed.map((row) => [row.folder, row.contactId, row.delivery]),
			[
				['sent', contactId, 'sent'],
				['sent', null, 'sent'],
			],
		);
	});

	it('threads a reply, attaches documents and removes the draft', async () => {
		api.mailbox.deliver(
			await new MailComposer({
				from: 'lea@example.ch',
				to: (await call('POST', '/mail/filing-address')).body.filingAddress,
				subject: 'Frage',
				text: 'Wann?',
				messageId: '<frage-1@example.ch>',
			})
				.compile()
				.build(),
		);
		await api.inbound.poll();
		const question = await api.owner
			.selectFrom('mails')
			.select('id')
			.where('subject', '=', 'Frage')
			.executeTakeFirstOrThrow();
		const draftId = uuid();
		await call('POST', '/sync/write', {
			ops: [
				{
					op: 'PUT',
					table: 'mails',
					id: draftId,
					data: {
						folder: 'drafts',
						sender: 'compose@example.ch',
						from_name: 'Test Person',
						recipients: '["lea@example.ch"]',
						subject: 'Re: Frage',
						body: 'Am Freitag.',
						sent_at: new Date().toISOString(),
						is_read: 1,
						starred: 0,
						contact_id: contactId,
					},
				},
			],
		});
		const documentId = uuid();
		await call('POST', '/sync/write', {
			ops: [
				{
					op: 'PUT',
					table: 'documents',
					id: documentId,
					data: {
						name: 'Merkblatt.pdf',
						folder_id: null,
						mime_type: 'application/pdf',
						size: 3,
						data_url: 'data:application/pdf;base64,YWJj',
						targets: '[]',
						uploaded_by: (await call('GET', '/me')).body.user.id,
					},
				},
			],
		});
		const sent = await send({
			to: ['lea@example.ch'],
			subject: 'Re: Frage',
			body: 'Am Freitag.',
			replyToId: question.id,
			draftId,
			attachmentIds: [documentId],
		});
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		const reply = api.mailer.last('lea@example.ch');
		assert.deepEqual(reply.headers, { 'In-Reply-To': '<frage-1@example.ch>', References: '<frage-1@example.ch>' });
		assert.deepEqual(
			reply.attachments?.map((file) => [file.filename, file.contentType, Buffer.from(file.content).toString()]),
			[['Merkblatt.pdf', 'application/pdf', 'abc']],
		);
		assert.equal(
			await api.owner.selectFrom('mails').select('id').where('id', '=', draftId).executeTakeFirst(),
			undefined,
		);
	});

	it('uses business senders only with the right permission and personal ones only for oneself', async () => {
		await call('POST', '/mail/domains', { domain: 'praxis-post.ch', purpose: 'business' });
		const business = (
			await call('POST', '/mail/senders', {
				kind: 'business',
				address: 'info@praxis-post.ch',
				displayName: 'Praxis Post',
				replyTo: null,
				userId: null,
				signature: 'Ihre Praxis Post',
				isDefault: true,
			})
		).body;
		const writer = await api.member(admin, 'schreiber@example.ch', ['mail.read', 'mail.write', 'contacts.read']);
		assert.deepEqual((await call('GET', '/mail/my-senders', undefined, writer.token)).body, []);
		const refused = await send(
			{ to: ['lea@example.ch'], subject: 'x', body: 'y', senderId: business.id },
			writer.token,
		);
		assert.equal(refused.status, 403);

		const office = await api.member(admin, 'office@example.ch', ['mail.read', 'mail.write', 'mail.business']);
		const mine = (await call('GET', '/mail/my-senders', undefined, office.token)).body;
		assert.deepEqual(
			mine.map((sender: { address: string }) => sender.address),
			['info@praxis-post.ch'],
		);
		const sent = await send(
			{ to: ['lea@example.ch'], subject: 'Info', body: 'Hallo', senderId: business.id },
			office.token,
		);
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		const mail = api.mailer.last('lea@example.ch');
		assert.deepEqual([mail.fromName, mail.replyTo], ['Praxis Post', 'info@praxis-post.ch']);
		assert.match(mail.text, /Ihre Praxis Post/);
	});

	it('files nothing under «Gesendet» that did not go through «Senden»', async () => {
		const fake = {
			folder: 'sent',
			sender: 'compose@example.ch',
			from_name: 'Test Person',
			recipients: '["lea@example.ch"]',
			subject: 'Nie gesendet',
			body: '',
			sent_at: new Date().toISOString(),
			is_read: 1,
			starred: 0,
			contact_id: null,
		};
		const written = await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'mails', id: uuid(), data: fake }] });
		assert.equal(written.status, 403);
	});

	it('takes a send back while it waits for «undo send», and refuses once it is on its way', async () => {
		api.config.MAIL_UNDO_SECONDS = 10;
		try {
			const sent = await send({ to: ['zurueck@example.ch'], subject: 'Doch nicht', body: 'Entwurf' });
			assert.equal(sent.status, 201, JSON.stringify(sent.body));
			assert.ok(sent.body.undoUntil);
			// The worker ran after the request, but the mail waits.
			assert.equal(api.mailer.sent.filter((mail) => mail.to === 'zurueck@example.ch').length, 0);
			const cancelled = await call('POST', '/mail/send/cancel', { outboxIds: sent.body.outboxIds });
			assert.deepEqual([cancelled.status, cancelled.body], [200, { cancelled: 1 }]);
			const left = await api.owner.selectFrom('mails').select('id').where('subject', '=', 'Doch nicht').execute();
			assert.deepEqual(left, []);

			const later = await send({ to: ['spaeter@example.ch'], subject: 'Geht raus', body: 'Text' });
			api.clock.offset += 11_000;
			await api.mailWorker.drain();
			assert.equal(api.mailer.sent.filter((mail) => mail.to === 'spaeter@example.ch').length, 1);
			const tooLate = await call('POST', '/mail/send/cancel', { outboxIds: later.body.outboxIds });
			assert.equal(tooLate.status, 409);
		} finally {
			api.config.MAIL_UNDO_SECONDS = undefined;
			api.clock.offset = 0;
		}
	});

	it('stops at the daily limit, also for parallel sends', async () => {
		const sent = await send({
			to: Array.from({ length: 20 }, (_, index) => `viele-${index}@example.ch`),
			subject: 's',
			body: 'b',
		});
		assert.equal(sent.status, 201);
		const many = await Promise.all(
			Array.from({ length: 24 }, (_, index) =>
				send({ to: Array.from({ length: 20 }, (_, n) => `l-${index}-${n}@example.ch`), subject: 's', body: 'b' }),
			),
		);
		// 24 earlier + 23 × 20 fit under 500; the 24th batch does not.
		assert.equal(many.filter((response) => response.status === 429).length, 1);
		assert.equal(many.find((response) => response.status === 429)!.body.error.code, 'error.ws.mail_limit');
	});
});
