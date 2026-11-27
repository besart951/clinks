import assert from 'node:assert/strict';
import { afterAll, beforeAll, it } from 'vitest';
import { pruneMailOutbox } from '../../src/services/mail-retention.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('aufbewahrung@example.ch', 'Praxis Archiv');
});
afterAll(async () => {
	await api?.stop();
});

const call = (method: string, path: string, body?: unknown) =>
	admin.browser.call(method, path, { token: admin.token, body });
const day = 86_400_000;

it('keeps outbox bodies 90 days and the rest two years, once a day per workspace', async () => {
	await call('POST', '/mail/send', {
		senderId: null,
		to: ['alt@example.ch', 'neu@example.ch'],
		subject: 'Hallo',
		body: 'Vertraulicher Inhalt',
		attachmentIds: [],
		replyToId: null,
		draftId: null,
	});
	const rows = await api.owner.selectFrom('mailOutbox').select(['id', 'recipient']).orderBy('recipient').execute();
	const [old, recent] = rows;
	await api.owner
		.updateTable('mailOutbox')
		.set({ createdAt: new Date(Date.now() - 91 * day) })
		.where('id', '=', old.id)
		.execute();

	assert.equal(await pruneMailOutbox(api.db, new Date()), 1);
	const after = await api.owner.selectFrom('mailOutbox').selectAll().orderBy('recipient').execute();
	assert.deepEqual([after[0].textBody, after[0].htmlBody, after[0].status], ['', '', 'sent']);
	assert.match(after[1].textBody, /Vertraulicher Inhalt/);
	// Filed copies are the workspace's mailbox and stay.
	const filed = await api.owner.selectFrom('mails').select('body').where('subject', '=', 'Hallo').execute();
	assert.ok(filed.every((mail) => String(mail.body).includes('Vertraulicher Inhalt')));

	// Checked again only after a day; then rows older than two years go.
	await api.owner
		.updateTable('mailOutbox')
		.set({ createdAt: new Date(Date.now() - 731 * day) })
		.where('id', '=', recent.id)
		.execute();
	await pruneMailOutbox(api.db, new Date());
	assert.equal((await api.owner.selectFrom('mailOutbox').select('id').execute()).length, 2);
	await pruneMailOutbox(api.db, new Date(Date.now() + day + 60_000));
	assert.deepEqual(
		(await api.owner.selectFrom('mailOutbox').select('id').execute()).map((row) => row.id),
		[old.id],
	);
});

it('exports the mail data without DKIM keys or bodies', async () => {
	await call('POST', '/mail/domains', { domain: 'praxis-archiv.ch', purpose: 'business' });
	const exported = (await call('GET', '/mail/export')).body;
	assert.deepEqual(Object.keys(exported).sort(), [
		'mailDomains',
		'mailOutbox',
		'mailSenders',
		'mailSuppressions',
		'newsletterConsents',
		'newsletterForms',
	]);
	assert.equal(exported.mailDomains[0].domain, 'praxis-archiv.ch');
	const text = JSON.stringify(exported);
	assert.doesNotMatch(text, /PRIVATE KEY|privateKey|Vertraulicher Inhalt|textBody|htmlBody/);
	assert.equal(exported.mailOutbox[0].recipient, 'alt@example.ch');
});
