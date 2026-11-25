import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { UserId } from '../src/ids.ts';
import { permissionAreas, roleGrants, userPermissions } from '../src/permissions.ts';
import { changedVisitRecipients, isReleased, visitWeek } from '../src/spitex-release.ts';

const anna = 'anna' as UserId;
const beat = 'beat' as UserId;
const visit = (assigneeId: UserId | null, start = '2026-12-08T08:00:00.000Z') => ({
	kind: 'spitex' as const,
	assigneeId,
	start,
	end: '2026-12-08T08:45:00.000Z',
	status: 'planned' as const,
	location: '',
	contactId: null,
});

describe('releasing the Spitex plan', () => {
	it('puts a visit into the week of the tenant’s time zone', () => {
		assert.equal(visitWeek('2026-12-08T08:00:00.000Z', 'Europe/Zurich'), '2026-12-07');
		// Sunday 23:30 in Zurich is already Monday in Auckland and still Sunday in UTC.
		assert.equal(visitWeek('2026-12-06T22:30:00.000Z', 'Europe/Zurich'), '2026-11-30');
		assert.equal(visitWeek('2026-12-06T22:30:00.000Z', 'Pacific/Auckland'), '2026-12-07');
		// Monday 00:30 in Zurich is Sunday 23:30 UTC: the new week.
		assert.equal(visitWeek('2026-12-06T23:30:00.000Z', 'Europe/Zurich'), '2026-12-07');
		assert.equal(isReleased([{ weekStart: '2026-12-07' }], '2026-12-07'), true);
		assert.equal(isReleased([{ weekStart: '2026-12-07' }], '2026-12-14'), false);
	});

	it('tells the people whose released visits changed, and nobody about drafts', () => {
		const released = () => true;
		assert.deepEqual(changedVisitRecipients(null, visit(anna), released), [anna]);
		assert.deepEqual(changedVisitRecipients(visit(anna), null, released), [anna]);
		assert.deepEqual(changedVisitRecipients(visit(anna), visit(beat), released), [anna, beat]);
		assert.deepEqual(changedVisitRecipients(visit(anna), visit(anna, '2026-12-08T10:00:00.000Z'), released), [anna]);
		assert.deepEqual(changedVisitRecipients(visit(anna), visit(anna), released), []);
		assert.deepEqual(changedVisitRecipients(visit(null), visit(null, '2026-12-09T08:00:00.000Z'), released), []);
		assert.deepEqual(
			changedVisitRecipients(visit(anna), visit(beat), () => false),
			[],
		);
		// Moved out of a released week: the person loses the visit and hears about it.
		const moved = visit(anna, '2026-12-15T08:00:00.000Z');
		assert.deepEqual(
			changedVisitRecipients(visit(anna), moved, (start) => start < '2026-12-14'),
			[anna],
		);
		assert.deepEqual(changedVisitRecipients({ ...visit(anna), kind: 'meeting' }, null, released), []);
	});

	it('groups the new permissions into their own areas and lets the whole plan include the own visits', () => {
		const areas = Object.fromEntries(permissionAreas().map((area) => [area.area, area]));
		assert.deepEqual(areas.spitex, { area: 'spitex', read: 'spitex.read', write: 'spitex.write' });
		assert.deepEqual(areas.spitex_own, { area: 'spitex_own', read: 'spitex.own.read', write: null });
		assert.deepEqual(areas.spitex_release, { area: 'spitex_release', read: null, write: 'spitex.release' });
		assert.deepEqual(areas.team, { area: 'team', read: null, write: 'team.manage' });
		assert.equal(roleGrants({ kind: 'custom', permissions: ['spitex.read'] }, 'spitex.own.read'), true);
		assert.equal(roleGrants({ kind: 'custom', permissions: ['spitex.own.read'] }, 'spitex.read'), false);
		assert.equal(roleGrants({ kind: 'custom', permissions: ['spitex.write'] }, 'spitex.release'), false);
		assert.equal(userPermissions.includes('spitex.release'), false);
	});
});
