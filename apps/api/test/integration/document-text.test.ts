import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { startApi, type Api } from './harness.ts';

let api: Api;
let admin: Awaited<ReturnType<Api['administrator']>>;
let userId: string;
beforeAll(async () => {
	api = await startApi();
	admin = await api.administrator('text@example.ch', 'Praxis Text');
	({ userId } = await api.owner
		.selectFrom('memberships')
		.select('userId')
		.where('tenantId', '=', admin.tenantId)
		.executeTakeFirstOrThrow());
});
afterAll(async () => {
	await api?.stop();
});

describe('full-text search', () => {
	it('reads the text of a new file and of its next version, and none from a picture', async () => {
		const id = uuid();
		const put = (name: string, type: string, text: string) =>
			admin.browser.call('POST', '/sync/write', {
				token: admin.token,
				body: {
					ops: [
						{
							op: 'PUT',
							table: 'documents',
							id,
							data: {
								name,
								mime_type: type,
								size: Buffer.byteLength(text),
								data_url: `data:${type};base64,${Buffer.from(text).toString('base64')}`,
								targets: '[]',
								uploaded_by: userId,
							},
						},
					],
				},
			});
		const text = () =>
			api.owner.selectFrom('documents').select('searchText').where('id', '=', id).executeTakeFirstOrThrow();
		assert.equal((await put('Notiz.txt', 'text/plain', 'Kostengutsprache   der  Krankenkasse')).status, 200);
		assert.equal((await text()).searchText, 'Kostengutsprache der Krankenkasse');
		await put('Bild.png', 'image/png', 'not really a picture');
		assert.equal((await text()).searchText, null);
	});
});

describe('sharing a file by link', () => {
	it('opens without an account until it ends or is revoked, and counts the openings', async () => {
		const id = uuid();
		await admin.browser.call('POST', '/sync/write', {
			token: admin.token,
			body: {
				ops: [
					{
						op: 'PUT',
						table: 'documents',
						id,
						data: {
							name: 'Arztbericht.txt',
							mime_type: 'text/plain',
							size: 6,
							data_url: 'data:text/plain;base64,QmVyaWNo',
							targets: '[]',
							uploaded_by: userId,
						},
					},
				],
			},
		});
		const made = await admin.browser.call('POST', `/documents/${id}/shares`, { token: admin.token, body: { days: 7 } });
		assert.equal(made.status, 201, JSON.stringify(made.body));
		const token = /#\/share\/(.+)$/.exec(made.body.url)![1];
		const visitor = api.client();
		const details = await visitor.call('GET', `/shares/${token}`);
		assert.deepEqual(
			[details.status, details.body.name, details.body.tenantName],
			[200, 'Arztbericht.txt', 'Praxis Text'],
		);
		const file = await visitor.call('POST', `/shares/${token}`);
		assert.equal(file.body.url, 'data:text/plain;base64,QmVyaWNo');
		const listed = await admin.browser.call('GET', `/documents/${id}/shares`, { token: admin.token });
		assert.equal(listed.body[0].openCount, 1);

		// After its end it is gone, and a revoked one is gone at once.
		api.clock.offset += 8 * 86_400_000;
		assert.equal((await visitor.call('GET', `/shares/${token}`)).status, 404);
		api.clock.offset = 0;
		const again = await admin.browser.call('POST', `/documents/${id}/shares`, {
			token: admin.token,
			body: { days: 1 },
		});
		const second = /#\/share\/(.+)$/.exec(again.body.url)![1];
		assert.equal(
			(await admin.browser.call('DELETE', `/document-shares/${again.body.id}`, { token: admin.token })).status,
			204,
		);
		assert.equal((await visitor.call('GET', `/shares/${second}`)).status, 404);
		assert.equal(
			(await admin.browser.call('POST', `/documents/${id}/shares`, { token: admin.token, body: { days: 3 } })).status,
			400,
		);
	});
});
