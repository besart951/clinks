import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { expireSignUps } from '../../src/services/newsletter-signup.ts';
import { contactRow } from './fixtures.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
let form: { id: string; token: string };
beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('newsletter@example.ch', 'Praxis Brief');
	form = (
		await call('POST', '/mail/newsletter-forms', {
			title: 'Unser Newsletter',
			intro: 'Viermal im Jahr Neuigkeiten aus der Praxis.',
			tags: ['Newsletter'],
			consentText: 'Ich möchte den Newsletter der Praxis Brief per E-Mail erhalten.',
			active: true,
		})
	).body;
});
afterAll(async () => {
	await api?.stop();
});

const call = (method: string, path: string, body?: unknown, token = admin.token) =>
	admin.browser.call(method, path, { token, body });
const visitor = () => api.client();
const signUp = (email: string, extra: Record<string, unknown> = {}) =>
	visitor().call('POST', `/newsletter/forms/${form.token}`, {
		body: { firstName: 'Nina', lastName: 'Frei', email, consent: true, website: '', ...extra },
	});
const confirmToken = (email: string) =>
	decodeURIComponent(/newsletter\/confirm\/([A-Za-z0-9_%-]+)/.exec(api.mailer.last(email).text)![1]);
const contactBy = (email: string) =>
	api.owner.selectFrom('contacts').selectAll().where('email', '=', email).executeTakeFirst();

async function contact(email: string, tags: string[]) {
	const id = uuid();
	await call('POST', '/sync/write', {
		ops: [{ op: 'PUT', table: 'contacts', id, data: { ...contactRow, email, tags: JSON.stringify(tags) } }],
	});
	return id;
}

describe('double opt-in', () => {
	it('adds the person only once they confirm, with the form’s tags and the text they agreed to', async () => {
		const page = await visitor().call('GET', `/newsletter/forms/${form.token}`);
		assert.deepEqual(page.body, {
			tenantName: 'Praxis Brief',
			title: 'Unser Newsletter',
			intro: 'Viermal im Jahr Neuigkeiten aus der Praxis.',
			consentText: 'Ich möchte den Newsletter der Praxis Brief per E-Mail erhalten.',
		});

		assert.equal((await signUp('bot@example.ch', { website: 'http://spam.example' })).status, 202);
		assert.throws(() => api.mailer.last('bot@example.ch'));

		assert.equal((await signUp('Nina@Example.ch')).status, 202);
		const optin = api.mailer.last('Nina@Example.ch');
		assert.match(optin.subject, /Bitte bestätigen Sie Ihre Anmeldung bei Praxis Brief/);
		assert.equal(await contactBy('nina@example.ch'), undefined);

		const token = confirmToken('Nina@Example.ch');
		const confirmed = await visitor().call('POST', `/newsletter/confirm/${encodeURIComponent(token)}`);
		assert.deepEqual(confirmed.body, { tenantName: 'Praxis Brief' });
		const nina = (await contactBy('nina@example.ch'))!;
		assert.deepEqual([nina.newsletter, nina.tags, nina.firstName], ['subscribed', ['Newsletter'], 'Nina']);
		const history = (await call('GET', `/contacts/${nina.id}/newsletter`)).body;
		assert.deepEqual(
			history.map((entry: { status: string; source: string; consentText: string }) => [
				entry.status,
				entry.source,
				entry.consentText,
			]),
			[['subscribed', 'form', 'Ich möchte den Newsletter der Praxis Brief per E-Mail erhalten.']],
		);
		assert.equal((await visitor().call('POST', `/newsletter/confirm/${encodeURIComponent(token)}`)).status, 410);
	});

	it('deletes sign-ups nobody confirmed within seven days', async () => {
		await signUp('spaet@example.ch');
		const token = confirmToken('spaet@example.ch');
		api.clock.offset = 8 * 24 * 60 * 60_000;
		try {
			assert.equal(await expireSignUps(api.db, new Date(Date.now() + api.clock.offset)), 1);
			const left = await api.owner.selectFrom('newsletterRequests').select('id').execute();
			assert.deepEqual(left, []);
			assert.equal((await visitor().call('POST', `/newsletter/confirm/${encodeURIComponent(token)}`)).status, 410);
		} finally {
			api.clock.offset = 0;
		}
	});

	it('records consent by hand and imports consents for known addresses only', async () => {
		const id = await contact('papier@example.ch', []);
		const recorded = await call('POST', `/contacts/${id}/newsletter`, {
			status: 'subscribed',
			note: 'Anmeldebogen am Empfang',
		});
		assert.equal(recorded.status, 204);
		await contact('import@example.ch', []);
		const imported = await call('POST', '/mail/newsletter-consents/import', {
			emails: ['IMPORT@example.ch', 'fremd@example.ch'],
			note: 'Liste aus dem alten Programm',
		});
		assert.deepEqual(imported.body, { subscribed: 1, unknown: ['fremd@example.ch'] });
		assert.equal((await contactBy('import@example.ch'))!.newsletter, 'subscribed');
	});
});

describe('campaigns', () => {
	let campaignId: string;
	let writer: { token: string };

	it('reaches the tag’s subscribed contacts minus blocked addresses', async () => {
		for (const email of ['ja@example.ch', 'gesperrt@example.ch', 'abgemeldet@example.ch']) {
			const id = await contact(email, ['Newsletter']);
			await call('POST', `/contacts/${id}/newsletter`, { status: 'subscribed', note: 'Telefonisch' });
		}
		await contact('ohne@example.ch', ['Newsletter']);
		const gone = (await contactBy('abgemeldet@example.ch'))!;
		await call('POST', `/contacts/${gone.id}/newsletter`, { status: 'unsubscribed', note: 'Telefonisch' });
		await api.owner
			.insertInto('mailSuppressions')
			.values({ tenantId: admin.tenantId, address: 'gesperrt@example.ch', scope: 'all', reason: 'bounced' })
			.execute();

		campaignId = uuid();
		const created = await call('POST', '/sync/write', {
			ops: [
				{
					op: 'PUT',
					table: 'campaigns',
					id: campaignId,
					data: {
						name: 'Winter',
						subject: 'Neuigkeiten für {vorname}',
						preview_text: 'Was im Winter neu ist',
						body: 'Guten Tag {anrede}\n\nNeu bei uns: Rückenkurse am Abend.',
						audience_tag: 'Newsletter',
						// Ignored on upload: the workflow belongs to the server.
						status: 'sent',
					},
				},
			],
		});
		assert.equal(created.status, 200, JSON.stringify(created.body));
		const stored = await api.owner
			.selectFrom('campaigns')
			.selectAll()
			.where('id', '=', campaignId)
			.executeTakeFirstOrThrow();
		assert.equal(stored.status, 'draft');
		// Nina (form), ja@ — not gesperrt@ (bounced), abgemeldet@ (unsubscribed), ohne@ (no consent).
		assert.deepEqual((await call('GET', `/mail/campaigns/${campaignId}/audience`)).body, { count: 2, suppressed: 1 });
	});

	it('needs a second person to approve once two people write mail', async () => {
		assert.equal((await call('POST', `/mail/campaigns/${campaignId}/review`)).status, 204);
		assert.equal((await call('POST', `/mail/campaigns/${campaignId}/approve`)).status, 204, 'alone: own approval');
		assert.equal((await call('POST', `/mail/campaigns/${campaignId}/withdraw`)).status, 204);

		writer = await api.member(admin, 'zweite@example.ch', ['mail.read', 'mail.write', 'contacts.read']);
		assert.equal((await call('POST', `/mail/campaigns/${campaignId}/review`)).status, 204);
		const own = await call('POST', `/mail/campaigns/${campaignId}/approve`);
		assert.equal(own.status, 403);
		assert.equal(own.body.error.code, 'error.ws.campaign_second_person');
		assert.equal((await call('POST', `/mail/campaigns/${campaignId}/approve`, undefined, writer.token)).status, 204);

		const edited = await call('POST', '/sync/write', {
			ops: [{ op: 'PATCH', table: 'campaigns', id: campaignId, data: { body: 'Geändert nach der Freigabe' } }],
		});
		assert.equal(edited.status, 403);
	});

	it('sends one mail per recipient with one-click unsubscribe and nothing that tracks', async () => {
		await call('POST', `/mail/campaigns/${campaignId}/test`);
		assert.match(api.mailer.last('newsletter@example.ch').subject, /^\[Test\] Neuigkeiten für Test$/);

		assert.equal((await call('POST', `/mail/campaigns/${campaignId}/schedule`, { at: null })).status, 204);
		// The next request lets the dispatcher run.
		await call('GET', `/mail/campaigns/${campaignId}/audience`);
		const mail = api.mailer.last('ja@example.ch');
		assert.equal(mail.subject, 'Neuigkeiten für Lea');
		assert.match(mail.text, /^Guten Tag Lea Muster/);
		assert.equal(mail.headers?.['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
		const oneClick = /^<http:\/\/api\.test(\/mail\/unsubscribe\/[^>]+)>$/.exec(mail.headers!['List-Unsubscribe'])![1];
		assert.doesNotMatch(mail.html ?? '', /<img/i);
		assert.match(mail.html ?? '', /href="http:\/\/web\.test\/#\/unsubscribe\/[^"]+"/);
		assert.equal((mail.html ?? '').match(/href="/g)?.length, 1, 'no other (rewritten) links');
		assert.throws(() => api.mailer.last('gesperrt@example.ch'));
		assert.throws(() => api.mailer.last('abgemeldet@example.ch'));
		assert.throws(() => api.mailer.last('ohne@example.ch'));
		const sent = await api.owner
			.selectFrom('campaigns')
			.selectAll()
			.where('id', '=', campaignId)
			.executeTakeFirstOrThrow();
		assert.equal(sent.status, 'sent');
		assert.deepEqual(sent.stats, { recipients: 2, sent: 2, bounced: 0, unsubscribes: 0 });

		// A mail app's one-click POST (RFC 8058); a second one changes nothing.
		const token = oneClick.split('/').at(-1)!;
		for (let round = 0; round < 2; round++)
			assert.equal((await visitor().call('POST', oneClick, { body: undefined })).status, 204);
		assert.equal((await contactBy('ja@example.ch'))!.newsletter, 'unsubscribed');
		const after = await api.owner
			.selectFrom('campaigns')
			.select('stats')
			.where('id', '=', campaignId)
			.executeTakeFirstOrThrow();
		assert.deepEqual(after.stats, { recipients: 2, sent: 2, bounced: 0, unsubscribes: 1 });
		assert.deepEqual((await visitor().call('GET', `/newsletter/unsubscribe/${token}`)).body, {
			tenantName: 'Praxis Brief',
			done: true,
		});
		const opened = await visitor().call('GET', oneClick);
		assert.equal(opened.status, 302);
		assert.equal(opened.headers.get('location'), `http://web.test/#/unsubscribe/${token}`);
		const tampered = `${token.slice(0, -2)}${token.endsWith('aa') ? 'bb' : 'aa'}`;
		assert.equal((await visitor().call('POST', `/mail/unsubscribe/${tampered}`)).status, 404);
	});
});
