import assert from 'node:assert/strict';
import { sql } from 'kysely';
import { serverColumns, syncedTables } from '@clinks/sync-schema/tables';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { uuid } from '../../src/crypto.ts';
import { password, startApi, type Api } from './harness.ts';

let api: Api;

beforeAll(async () => {
	api = await startApi();
});

afterAll(async () => {
	await api?.stop();
});

const contact = (overrides: Record<string, unknown> = {}) => ({
	kind: 'person',
	first_name: 'Lea',
	last_name: 'Muster',
	company_name: '',
	email: 'lea@example.ch',
	phone: '',
	address: JSON.stringify({ street: 'Weg 1', zip: '3000', city: 'Bern' }),
	birth_date: '1980-05-01',
	insurer: '',
	tags: JSON.stringify(['vip']),
	notes: '',
	archived: 0,
	...overrides,
});

async function write(token: string, ops: unknown[]) {
	return api.client().call('POST', '/sync/write', { token, body: { ops } });
}

describe('sync schema', () => {
	it('matches the migration column for column', async () => {
		for (const [table, definition] of Object.entries(syncedTables)) {
			const { rows } = await sql<{ columnName: string }>`
				select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table}
			`.execute(api.owner);
			const expected = [
				'id',
				...serverColumns.map((column) => column.column),
				...definition.columns.map((column) => column.column),
			];
			assert.deepEqual(rows.map((row) => row.columnName).sort(), expected.sort(), table);
		}
	});
});

describe('sync write endpoint', () => {
	it('applies puts and patches with revisions, json and audit entries', async () => {
		const owner = await api.administrator('sync-owner@example.ch', 'Sync AG');
		const id = uuid();
		const appointmentId = uuid();
		const created = await write(owner.token, [
			{ op: 'PUT', table: 'contacts', id, data: contact() },
			{
				op: 'PUT',
				table: 'appointments',
				id: appointmentId,
				data: {
					title: 'Erstgespräch',
					kind: 'meeting',
					status: 'planned',
					contact_id: id,
					starts_at: '2026-12-01T09:00:00.000Z',
					ends_at: '2026-12-01T10:00:00.000Z',
					location: '',
					notes: '',
				},
			},
		]);
		assert.equal(created.status, 200, JSON.stringify(created.body));
		await write(owner.token, [{ op: 'PATCH', table: 'contacts', id, data: { notes: 'Rückruf' } }]);

		const row = await api.owner.selectFrom('contacts').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
		assert.equal(row.tenantId, owner.tenantId);
		assert.equal(row.revision, 2);
		assert.equal(row.notes, 'Rückruf');
		assert.deepEqual(row.tags, ['vip']);
		assert.equal(row.birthDate, '1980-05-01');
		const appointment = await api.owner
			.selectFrom('appointments')
			.selectAll()
			.where('id', '=', appointmentId)
			.executeTakeFirstOrThrow();
		assert.equal(appointment.contactId, id);
		const actions = await api.owner
			.selectFrom('audit')
			.select('action')
			.where('target', 'in', [id, appointmentId])
			.execute();
		assert.deepEqual(actions.map((entry) => entry.action).sort(), [
			'appointment.created',
			'contact.created',
			'contact.updated',
		]);
	});

	it('applies a transaction all or nothing and returns the domain rule that failed', async () => {
		const owner = await api.administrator('sync-rules@example.ch', 'Rules AG');
		const good = uuid();
		const result = await write(owner.token, [
			{ op: 'PUT', table: 'contacts', id: good, data: contact() },
			{ op: 'PUT', table: 'contacts', id: uuid(), data: contact({ last_name: '' }) },
		]);
		assert.equal(result.status, 400);
		assert.ok(result.body.error.fields.lastName);
		assert.equal(
			await api.owner.selectFrom('contacts').select('id').where('id', '=', good).executeTakeFirst(),
			undefined,
		);

		const endBeforeStart = await write(owner.token, [
			{
				op: 'PUT',
				table: 'appointments',
				id: uuid(),
				data: {
					title: 'X',
					kind: 'meeting',
					status: 'planned',
					starts_at: '2026-12-01T10:00:00.000Z',
					ends_at: '2026-12-01T09:00:00.000Z',
					location: '',
					notes: '',
				},
			},
		]);
		assert.equal(endBeforeStart.status, 400);
		assert.ok(endBeforeStart.body.error.fields.end);
	});

	it('refuses unknown tables and columns', async () => {
		const owner = await api.administrator('sync-unknown@example.ch', 'Unknown AG');
		assert.equal((await write(owner.token, [{ op: 'PUT', table: 'users', id: uuid(), data: {} }])).status, 400);
		assert.equal(
			(await write(owner.token, [{ op: 'PUT', table: 'contacts', id: uuid(), data: contact({ password_hash: 'x' }) }]))
				.status,
			400,
		);
	});

	it('needs the write permission of the table', async () => {
		const owner = await api.administrator('sync-perm@example.ch', 'Perm AG');
		const userRole = (
			await api.owner.selectFrom('roles').select(['id', 'kind']).where('tenantId', '=', owner.tenantId).execute()
		).find((role) => role.kind === 'user')!;
		await api.client().call('POST', '/tenant/invitations', {
			token: owner.token,
			body: { email: 'reader@example.ch', roleId: userRole.id },
		});
		const accepted = await api.client().call('POST', `/invitations/${api.linkTokenIn('reader@example.ch')}/accept`, {
			body: { firstName: 'R', lastName: 'Reader', password },
		});
		const result = await write(accepted.body.session.accessToken, [
			{ op: 'PUT', table: 'contacts', id: uuid(), data: contact() },
		]);
		assert.equal(result.status, 403);
	});

	it('keeps tenants apart: another tenant’s rows can be neither changed, deleted nor taken over', async () => {
		const a = await api.administrator('sync-a@example.ch', 'Tenant A');
		const b = await api.administrator('sync-b@example.ch', 'Tenant B');
		const id = uuid();
		await write(a.token, [{ op: 'PUT', table: 'contacts', id, data: contact() }]);

		await write(b.token, [{ op: 'PATCH', table: 'contacts', id, data: { notes: 'from B' } }]);
		await write(b.token, [{ op: 'DELETE', table: 'contacts', id }]);
		const takeOver = await write(b.token, [{ op: 'PUT', table: 'contacts', id, data: contact({ notes: 'mine now' }) }]);
		assert.equal(takeOver.status, 409);

		const row = await api.owner.selectFrom('contacts').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
		assert.equal(row.tenantId, a.tenantId);
		assert.equal(row.notes, '');
		assert.equal(row.revision, 1);
	});

	it('needs a tenant in the token', async () => {
		const { token } = await api.signedUp('no-tenant@example.ch');
		assert.equal((await write(token, [{ op: 'PUT', table: 'contacts', id: uuid(), data: contact() }])).status, 403);
	});
});

describe('module uploads', () => {
	it('imports linked receipts atomically, preserves later edits on retry, and refuses foreign recipients', async () => {
		const owner = await api.administrator('modules-owner@example.ch', 'Module AG');
		const other = await api.administrator('modules-other@example.ch', 'Other AG');
		const member = await api.owner
			.selectFrom('memberships')
			.select('userId')
			.where('tenantId', '=', owner.tenantId)
			.executeTakeFirstOrThrow();
		const stranger = await api.owner
			.selectFrom('memberships')
			.select('userId')
			.where('tenantId', '=', other.tenantId)
			.executeTakeFirstOrThrow();
		const document = uuid(),
			expense = uuid();
		const ops = [
			{
				op: 'PUT',
				table: 'documents',
				id: document,
				data: {
					name: 'Beleg',
					mime_type: 'text/plain',
					size: 4,
					data_url: 'data:text/plain;base64,VGVzdA==',
					targets: JSON.stringify([{ kind: 'expense', id: expense }]),
					uploaded_by: member.userId,
				},
			},
			{
				op: 'PUT',
				table: 'expenses',
				id: expense,
				data: {
					date: '2026-11-22',
					description: 'Papier',
					supplier: 'Laden',
					category: 'material',
					amount: 1500,
					vat_rate: 810,
					receipt_id: document,
					status: 'open',
				},
			},
		];
		const migrate = () => owner.browser.call('POST', '/sync/import', { token: owner.token, body: { ops } });
		assert.equal((await migrate()).status, 200);
		assert.equal(
			(await write(owner.token, [{ op: 'PATCH', table: 'expenses', id: expense, data: { description: 'Papier A4' } }]))
				.status,
			200,
		);
		assert.equal((await migrate()).status, 200);
		const stored = await api.owner
			.selectFrom('expenses')
			.selectAll()
			.where('id', '=', expense)
			.executeTakeFirstOrThrow();
		assert.equal(stored.description, 'Papier A4');
		assert.equal(stored.receiptId, document);
		assert.equal(stored.revision, 2);
		assert.equal(
			(
				await write(owner.token, [
					{
						op: 'PUT',
						table: 'notifications',
						id: uuid(),
						data: {
							user_id: stranger.userId,
							kind: 'assignment',
							message: JSON.stringify({ key: 'ui.ws.notification.assigned', params: { target: 'Aufgabe' } }),
							href: '/planner',
							is_read: 0,
						},
					},
				])
			).status,
			400,
		);
		assert.equal(
			(await write(other.token, [{ op: 'PUT', table: 'expenses', id: uuid(), data: ops[1].data }])).status,
			400,
		);
	});

	it('reserves invoice numbers across concurrent devices, edits and restores', async () => {
		const owner = await api.administrator('numbers@example.ch', 'Numbers');
		const contactId = uuid();
		await write(owner.token, [{ op: 'PUT', table: 'contacts', id: contactId, data: contact() }]);
		const data = {
			number: 'forged',
			kind: 'invoice',
			contact_id: contactId,
			issue_date: '2026-11-22',
			due_date: '2026-12-22',
			status: 'open',
			lines: JSON.stringify([{ description: 'Service', quantity: 1, unitPrice: 1000, vatRate: 0 }]),
			payments: '[]',
			reminder_level: 0,
			notes: '',
			appointment_ids: '[]',
		};
		const ops = [uuid(), uuid()].map((id) => ({ op: 'PUT', table: 'invoices', id, data }));
		for (const result of await Promise.all(ops.map((op) => write(owner.token, [op]))))
			assert.equal(result.status, 200, JSON.stringify(result.body));
		const rows = () =>
			api.owner
				.selectFrom('invoices')
				.select(['id', 'number'])
				.where('tenantId', '=', owner.tenantId)
				.orderBy('id')
				.execute();
		const original = await rows();
		assert.deepEqual(original.map((row) => row.number).sort(), ['2026-0001', '2026-0002']);
		assert.equal(
			(await write(owner.token, [{ op: 'PATCH', table: 'invoices', id: ops[0].id, data: { number: 'edit' } }])).status,
			200,
		);
		assert.equal((await write(owner.token, [{ op: 'DELETE', table: 'invoices', id: ops[1].id }])).status, 200);
		assert.equal((await write(owner.token, [ops[1]])).status, 200);
		assert.deepEqual(await rows(), original);
	});
	it('validates the clinical note kind and the permission of its module', async () => {
		const owner = await api.administrator('clinical@example.ch', 'Praxis');
		const contactId = uuid();
		const member = await api.owner
			.selectFrom('memberships')
			.select(['userId', 'roleId'])
			.where('tenantId', '=', owner.tenantId)
			.executeTakeFirstOrThrow();
		const noteId = uuid();
		const data = {
			kind: 'physio',
			contact_id: contactId,
			date: '2026-11-22',
			author_id: member.userId,
			subjective: '',
			objective: '',
			assessment: '',
			plan: '',
		};
		assert.equal(
			(
				await write(owner.token, [
					{ op: 'PUT', table: 'contacts', id: contactId, data: contact() },
					{ op: 'PUT', table: 'physio_notes', id: noteId, data },
				])
			).status,
			200,
		);
		assert.equal((await write(owner.token, [{ op: 'PUT', table: 'physio_notes', id: noteId, data }])).status, 200);
		for (const op of ['PATCH', 'PUT', 'DELETE']) {
			assert.equal(
				(
					await write(owner.token, [
						{ op, table: 'physio_notes', id: noteId, data: { ...data, assessment: 'changed' } },
					])
				).status,
				403,
			);
		}
		assert.equal((await write(owner.token, [{ op: 'PUT', table: 'spitex_notes', id: uuid(), data }])).status, 400);
		const roleId = uuid();
		await api.owner
			.insertInto('roles')
			.values({
				id: roleId,
				tenantId: owner.tenantId,
				kind: 'custom',
				name: 'Spitex',
				permissions: ['spitex.read', 'spitex.write'],
			})
			.execute();
		await api.owner.updateTable('memberships').set({ roleId }).where('tenantId', '=', owner.tenantId).execute();
		assert.equal((await write(owner.token, [{ op: 'PUT', table: 'physio_notes', id: uuid(), data }])).status, 403);
		assert.equal(
			(await write(owner.token, [{ op: 'PUT', table: 'spitex_notes', id: uuid(), data: { ...data, kind: 'spitex' } }]))
				.status,
			200,
		);
	});
});
