import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { inScope } from '@clinks/db/scope';
import { uuid } from '../../src/crypto.ts';
import { MailWorker } from '../../src/services/mail-worker.ts';
import { enqueueMail } from '../../src/services/outbox.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let tenantId: string;
let userId: string;
beforeAll(async () => {
	api = await startApi();
	const admin = await api.administrator('outbox@example.ch', 'Outbox AG');
	const me = await admin.browser.call('GET', '/me', { token: admin.token });
	tenantId = me.body.tenants[0].id;
	userId = me.body.user.id;
});
afterAll(async () => {
	await api?.stop();
});

const queue = (
	to: string,
	extra: { attachments?: { documentId: string; filename: string; contentType: string; sha256?: string }[] } = {},
) =>
	inScope(api.db, { tenantId, userId }, (tx) =>
		enqueueMail(tx, tenantId, {
			kind: 'system',
			to,
			subject: 'Hallo',
			content: { blocks: [{ kind: 'text', text: 'Guten Tag' }] },
			...extra,
		}),
	);
const row = (id: string) =>
	api.owner.selectFrom('mailOutbox').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const queued = (id: string) =>
	api.owner.selectFrom('auth.mailQueue').selectAll().where('outboxId', '=', id).executeTakeFirst();

describe('mail outbox', () => {
	it('sends in the workspace layout, as HTML and text, with a message id', async () => {
		const id = await queue('layout@example.ch');
		await api.mailWorker.drain();
		const mail = api.mailer.last('layout@example.ch');
		assert.equal(mail.fromName, 'Outbox AG');
		assert.match(mail.html ?? '', /<html lang="de-CH">[\s\S]*Guten Tag/);
		assert.match(mail.text, /^Guten Tag\n\n--\nOutbox AG/);
		assert.equal(mail.messageId, `<${id}@clinks.ch>`);
		const sent = await row(id);
		assert.deepEqual([sent.status, sent.attempts], ['sent', 1]);
		assert.equal(await queued(id), undefined);
	});

	it('retries temporary failures with backoff and gives up on a permanent refusal', async () => {
		const original = api.mailer.send.bind(api.mailer);
		let failure: Error & { responseCode?: number } = Object.assign(new Error('greylisted'), { responseCode: 451 });
		api.mailer.send = async () => {
			throw failure;
		};
		try {
			const id = await queue('retry@example.ch');
			await api.mailWorker.drain();
			assert.deepEqual(
				[(await row(id)).status, (await row(id)).attempts, (await row(id)).error],
				['queued', 1, 'Error 451'],
			);
			const due = (await queued(id))!.dueAt.getTime();
			assert.ok(due - Date.now() > 50_000, 'next attempt about a minute later');
			// Not due yet: nothing happens.
			await api.mailWorker.drain();
			assert.equal((await row(id)).attempts, 1);

			failure = Object.assign(new Error('no such user'), { responseCode: 550 });
			await api.owner
				.updateTable('auth.mailQueue')
				.set({ dueAt: new Date(0) })
				.where('outboxId', '=', id)
				.execute();
			await api.mailWorker.drain();
			assert.deepEqual([(await row(id)).status, (await row(id)).attempts], ['failed', 2]);
			assert.equal(await queued(id), undefined);
		} finally {
			api.mailer.send = original;
		}
	});

	it('hands each mail to only one of two workers', async () => {
		const before = api.mailer.sent.length;
		const ids = await Promise.all(Array.from({ length: 6 }, (_, index) => queue(`pair-${index}@example.ch`)));
		const second = new MailWorker({ db: api.db, mailer: api.mailer, now: () => new Date() } as never, {
			ratePerSecond: 10_000,
		});
		const workers = [api.mailWorker, second];
		await Promise.all(workers.map((worker) => worker.drain()));
		assert.equal(api.mailer.sent.length - before, 6);
		for (const id of ids) assert.equal((await row(id)).attempts, 1);
	});

	it('never attaches an archived file that no longer matches its checksum', async () => {
		const documentId = uuid();
		await inScope(api.db, { tenantId, userId }, (tx) =>
			tx
				.insertInto('documents')
				.values({
					id: documentId,
					tenantId,
					name: 'a.pdf',
					folderId: null,
					mimeType: 'application/pdf',
					size: 3,
					dataUrl: 'data:application/pdf;base64,YWJj',
					targets: '[]',
					uploadedBy: userId,
				})
				.execute(),
		);
		const id = await queue('archive@example.ch', {
			attachments: [{ documentId, filename: 'a.pdf', contentType: 'application/pdf', sha256: 'f'.repeat(64) }],
		});
		await api.mailWorker.drain();
		assert.deepEqual([(await row(id)).status, (await row(id)).error], ['failed', 'ArchiveMismatch']);
	});
});
