import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

(globalThis as any).$state ??= (v: any) => v;
(globalThis as any).$derived ??= (v: any) => (typeof v === 'function' ? v() : v);

import { AuditLogViewModel } from '../src/audit-log-view-model.svelte.ts';

describe('AuditLogViewModel', () => {
	it('loads audit events and handles pagination cursor', async () => {
		const mockService = {
			auditEvents: async (filter: { cursor?: string }) => ({
				events: filter.cursor
					? [
							{
								id: 'evt-2',
								occurredAt: '2026-01-02T00:00:00Z',
								actorId: 'usr-2',
								actorEmail: 'admin@clinks.test',
								tenantId: 't1',
								tenantName: 'Tenant 1',
								action: 'login',
								target: '',
								description: 'Logged in',
							},
						]
					: [
							{
								id: 'evt-1',
								occurredAt: '2026-01-01T00:00:00Z',
								actorId: 'usr-1',
								actorEmail: 'super@clinks.test',
								tenantId: '',
								tenantName: '',
								action: 'tenant.create',
								target: '',
								description: 'Created tenant',
							},
						],
				nextCursor: filter.cursor ? '' : 'cursor-page-2',
			}),
		};

		const model = new AuditLogViewModel(mockService, { message: (e) => String(e) });

		await model.filterAuditEvents();
		assert.equal(model.auditEvents.length, 1);
		assert.equal(model.auditEvents[0].id, 'evt-1');
		assert.equal(model.nextAuditCursor, 'cursor-page-2');

		await model.loadMoreAuditEvents();
		assert.equal(model.auditEvents.length, 2);
		assert.equal(model.auditEvents[1].id, 'evt-2');
		assert.equal(model.nextAuditCursor, '');
		assert.equal(model.error, '');
	});
});
