import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { recordToRow, rowToRecord, uploadToFields, type SqliteRow } from '../src/mapping.ts';

describe('row mapping', () => {
	it('round-trips json, booleans, dates and optional fields', () => {
		const record = {
			id: 'c1',
			tenantId: 't1',
			revision: 2,
			createdAt: '2026-11-22T10:00:00.000Z',
			updatedAt: '2026-11-22T10:00:00.000Z',
			kind: 'person',
			firstName: 'Lea',
			lastName: 'Muster',
			companyName: '',
			email: '',
			phone: '',
			address: { street: 'Weg 1', zip: '3000', city: 'Bern' },
			birthDate: null,
			insurer: '',
			tags: ['vip'],
			notes: '',
			archived: true,
		};
		const row: SqliteRow = { id: 'c1', ...recordToRow('contacts', record) };
		assert.equal(row.archived, 1);
		assert.equal(row.address, '{"street":"Weg 1","zip":"3000","city":"Bern"}');
		assert.deepEqual(rowToRecord('contacts', row), record);
	});

	it('maps renamed columns and leaves out fields the table does not sync', () => {
		const row = recordToRow('appointments', { start: 'a', end: 'b', somethingLocal: 1 });
		assert.deepEqual(row, { starts_at: 'a', ends_at: 'b' });
	});

	it('reads upload data, ignores server columns and reports unknown ones', () => {
		const { fields, unknown } = uploadToFields('contacts', {
			archived: 0,
			tags: '["a"]',
			tenant_id: 'x',
			revision: 9,
			password: 'x',
		});
		assert.deepEqual(fields, { archived: false, tags: ['a'] });
		assert.deepEqual(unknown, ['password']);
	});
});
