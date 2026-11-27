import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { startApi, type Api } from './harness.ts';
import { contactRow, invoiceRow } from './fixtures.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('senders@example.ch', 'Praxis Sonne');
});
afterAll(async () => {
	await api?.stop();
});

const call = (method: string, path: string, body?: unknown) =>
	admin.browser.call(method, path, { token: admin.token, body });

const publish = (records: { host: string; value: string }[]) => {
	for (const record of records) api.dns.set(record.host, [record.value]);
};

describe('sender domains and senders', () => {
	let domain: { id: string; records: { record: string; host: string; value: string; ok: boolean | null }[] };

	it('adds a domain with its DNS records and verifies them once published', async () => {
		assert.equal((await call('POST', '/mail/domains', { domain: 'clinks.ch', purpose: 'business' })).status, 400);
		const added = await call('POST', '/mail/domains', { domain: ' Praxis-Sonne.CH ', purpose: 'business' });
		assert.equal(added.status, 201, JSON.stringify(added.body));
		domain = added.body;
		assert.equal(added.body.domain, 'praxis-sonne.ch');
		assert.equal(added.body.status, 'pending');
		assert.deepEqual(
			added.body.records.map((record: { record: string; host: string }) => [record.record, record.host]),
			[
				['spf', 'praxis-sonne.ch'],
				['dkim', `${added.body.records[1].host.split('.')[0]}._domainkey.praxis-sonne.ch`],
				['dmarc', '_dmarc.praxis-sonne.ch'],
			],
		);
		assert.equal((await call('POST', '/mail/domains', { domain: 'praxis-sonne.ch', purpose: 'business' })).status, 409);

		const missing = await call('POST', `/mail/domains/${domain.id}/check`);
		assert.equal(missing.body.status, 'pending');
		assert.deepEqual(
			missing.body.records.map((record: { ok: boolean }) => record.ok),
			[false, false, false],
		);
		publish(domain.records);
		const verified = await call('POST', `/mail/domains/${domain.id}/check`);
		assert.equal(verified.body.status, 'verified');

		// The private key is sealed in the auth schema and belongs to the published public key.
		const sealed = await api.owner
			.selectFrom('auth.mailDomainKeys')
			.select('privateKeyCiphertext')
			.where('domainId', '=', domain.id)
			.executeTakeFirstOrThrow();
		assert.doesNotMatch(sealed.privateKeyCiphertext, /PRIVATE KEY/);
	});

	it('takes senders only on a domain of the right purpose and sends invoices from the business sender', async () => {
		const sender = {
			kind: 'business',
			address: 'Rechnung@praxis-sonne.ch',
			displayName: 'Praxis Sonne Buchhaltung',
			replyTo: 'buchhaltung@praxis-sonne.ch',
			userId: null,
			signature: 'Freundliche Grüsse\nIhre Praxis Sonne',
			isDefault: true,
		};
		const wrong = await call('POST', '/mail/senders', { ...sender, kind: 'newsletter', isDefault: false });
		assert.equal(wrong.status, 400);
		const elsewhere = await call('POST', '/mail/senders', { ...sender, address: 'x@other.ch' });
		assert.equal(elsewhere.status, 400);
		const created = await call('POST', '/mail/senders', sender);
		assert.equal(created.status, 201, JSON.stringify(created.body));
		assert.deepEqual([created.body.address, created.body.active], ['rechnung@praxis-sonne.ch', true]);

		const contactId = uuid();
		const invoiceId = uuid();
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
		await call('POST', '/sync/write', {
			ops: [{ op: 'PUT', table: 'invoices', id: invoiceId, data: invoiceRow(contactId, { status: 'open' }) }],
		});
		const sent = await call('POST', `/finance/invoices/${invoiceId}/send`, {
			to: 'kundin@example.ch',
			method: 'attachment',
		});
		assert.equal(sent.status, 201, JSON.stringify(sent.body));
		const mail = api.relay.last('kundin@example.ch');
		assert.deepEqual(mail.from, { name: 'Praxis Sonne Buchhaltung', address: 'rechnung@praxis-sonne.ch' });
		assert.equal(mail.replyTo, 'buchhaltung@praxis-sonne.ch');
		assert.match(mail.text, /Freundliche Grüsse\nIhre Praxis Sonne/);
		assert.equal(mail.dkim?.domainName, 'praxis-sonne.ch');
		const publicKey = createPublicKey({
			key: Buffer.from(domain.records[1].value.split('p=')[1], 'base64'),
			format: 'der',
			type: 'spki',
		});
		const signature = sign('sha256', Buffer.from('probe'), createPrivateKey(mail.dkim!.privateKey));
		assert.ok(verify('sha256', Buffer.from('probe'), publicKey, signature));
	});

	it('falls back to the platform address and tells admins when the domain stops verifying', async () => {
		api.dns.clear();
		await api.owner
			.updateTable('mailDomains')
			.set({ checkedAt: new Date(0) })
			.execute();
		const contactId = uuid();
		const invoiceId = uuid();
		await call('POST', '/sync/write', { ops: [{ op: 'PUT', table: 'contacts', id: contactId, data: contactRow }] });
		await call('POST', '/sync/write', {
			ops: [{ op: 'PUT', table: 'invoices', id: invoiceId, data: invoiceRow(contactId, { status: 'open' }) }],
		});
		const relayed = api.relay.sent.length;
		await call('POST', `/finance/invoices/${invoiceId}/send`, { to: 'fallback@example.ch', method: 'attachment' });
		assert.equal(api.relay.sent.length, relayed);
		const mail = api.mailer.last('fallback@example.ch');
		assert.equal(mail.from, undefined);
		assert.equal(mail.fromName, 'Praxis Sonne Buchhaltung');
		assert.equal(mail.replyTo, 'buchhaltung@praxis-sonne.ch');
		const settings = await call('GET', '/mail/settings');
		assert.equal(settings.body.domains[0].status, 'failing');
		assert.equal(settings.body.senders[0].active, false);
		const notice = await api.owner
			.selectFrom('notifications')
			.select('message')
			.where('href', '=', '/settings/mail')
			.executeTakeFirst();
		assert.match(JSON.stringify(notice?.message), /mail_domain_failing/);
	});

	it('removes a domain only once no sender uses it', async () => {
		const settings = await call('GET', '/mail/settings');
		const [sender] = settings.body.senders;
		assert.equal((await call('DELETE', `/mail/domains/${domain.id}`)).status, 409);
		assert.equal((await call('DELETE', `/mail/senders/${sender.id}`)).status, 204);
		assert.equal((await call('DELETE', `/mail/domains/${domain.id}`)).status, 204);
		assert.equal((await call('GET', '/mail/settings')).body.domains.length, 0);
	});
});
