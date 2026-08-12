import type { Membership, Permission, Session } from '@clinks/api-client';

export type AccessMode = 'all' | 'any';

export interface AccessPolicy {
	permission?: Permission;
	permissions?: readonly Permission[];
	mode?: AccessMode;
	tenantId?: string;
	superAdministrator?: boolean;
	tenantAdministrator?: boolean;
}

export function activeMembership(session: Session | null, tenantId?: string): Membership | undefined {
	if (!session) return undefined;
	const targetTenantId = tenantId ?? session.activeTenant?.id;
	if (!targetTenantId) return undefined;
	return session.memberships.find(
		(membership) => membership.tenant.id === targetTenantId && membership.status === 'active',
	);
}

export function hasPermission(session: Session | null, permission: Permission, tenantId?: string): boolean {
	return activeMembership(session, tenantId)?.role.permissions.includes(permission) ?? false;
}

export function isTenantAdministrator(session: Session | null, tenantId?: string): boolean {
	return activeMembership(session, tenantId)?.role.kind === 'administrator';
}

export function isSuperAdministrator(session: Session | null): boolean {
	return session?.user.globalRole === 'super_administrator';
}

export function allowsAccess(session: Session | null, policy: AccessPolicy): boolean {
	const requestedPermissions = [...(policy.permission ? [policy.permission] : []), ...(policy.permissions ?? [])];
	const conditions: boolean[] = [];

	if (requestedPermissions.length > 0) {
		const matches = requestedPermissions.map((permission) => hasPermission(session, permission, policy.tenantId));
		conditions.push(policy.mode === 'any' ? matches.some(Boolean) : matches.every(Boolean));
	}
	if (policy.superAdministrator) conditions.push(isSuperAdministrator(session));
	if (policy.tenantAdministrator) conditions.push(isTenantAdministrator(session, policy.tenantId));

	return conditions.length > 0 && conditions.every(Boolean);
}
