import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Session } from '@clinks/api-client';
import { allowsAccess, hasPermission, isSuperAdministrator, isTenantAdministrator } from '../src/access.ts';

const session: Session = {
	user: { id: 'user-1', email: 'user@clinks.test', locale: 'de-CH', globalRole: 'user' },
	activeTenant: { id: 'tenant-1', name: 'One', revision: 1n },
	memberships: [
		{
			id: 'membership-1',
			userId: 'user-1',
			userEmail: 'user@clinks.test',
			tenant: { id: 'tenant-1', name: 'One', revision: 1n },
			role: {
				id: 'role-1',
				name: 'Administrator',
				kind: 'administrator',
				permissions: ['project.read', 'project.edit'],
				revision: 1n,
			},
			status: 'active',
			revision: 1n,
		},
	],
};

describe('access policies', () => {
	it('uses permissions from the active tenant only', () => {
		assert.equal(hasPermission(session, 'project.read'), true);
		assert.equal(hasPermission(session, 'project.delete'), false);
		assert.equal(hasPermission(session, 'project.read', 'tenant-2'), false);
	});

	it('supports all and any permission modes', () => {
		assert.equal(allowsAccess(session, { permissions: ['project.read', 'project.edit'] }), true);
		assert.equal(allowsAccess(session, { permissions: ['project.read', 'project.delete'] }), false);
		assert.equal(allowsAccess(session, { permissions: ['project.read', 'project.delete'], mode: 'any' }), true);
	});

	it('keeps global and tenant administrator checks separate', () => {
		assert.equal(isTenantAdministrator(session), true);
		assert.equal(isSuperAdministrator(session), false);
		assert.equal(allowsAccess(session, { tenantAdministrator: true, permission: 'project.read' }), true);
		assert.equal(allowsAccess(session, { superAdministrator: true, permission: 'project.read' }), false);
	});

	it('fails closed when no condition is supplied', () => {
		assert.equal(allowsAccess(session, {}), false);
	});

	it('ignores inactive memberships', () => {
		const inactiveSession = {
			...session,
			memberships: session.memberships.map((membership) => ({ ...membership, status: 'inactive' as const })),
		};
		assert.equal(hasPermission(inactiveSession, 'project.read'), false);
		assert.equal(isTenantAdministrator(inactiveSession), false);
	});
});
