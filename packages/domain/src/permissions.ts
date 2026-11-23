import { coreModules, permissions, type ModuleKey, type Permission, type Role, type Tenant } from './types.ts';
import { planIncludes } from './plans.ts';

export const administratorPermissions: readonly Permission[] = permissions;

export const userPermissions: readonly Permission[] = permissions.filter(
	(permission) => permission.endsWith('.read') && permission !== 'audit.read',
);

/** Groups permissions by area for the role matrix. */
export function permissionAreas(): { area: string; read: Permission | null; write: Permission | null }[] {
	const areas = new Map<string, { read: Permission | null; write: Permission | null }>();
	for (const permission of permissions) {
		const [area, action] = permission.split('.');
		const entry = areas.get(area) ?? { read: null, write: null };
		if (action === 'read') entry.read = permission;
		else entry.write = permission;
		areas.set(area, entry);
	}
	return [...areas.entries()].map(([area, entry]) => ({ area, ...entry }));
}

export function roleGrants(role: Pick<Role, 'permissions' | 'kind'> | null, permission: Permission | null): boolean {
	if (!role) return false;
	if (permission === null || role.kind === 'administrator') return true;
	return role.permissions.includes(permission);
}

export function moduleBooked(tenant: Pick<Tenant, 'plan' | 'enabledModules'>, module: ModuleKey): boolean {
	if (coreModules.includes(module)) return true;
	return planIncludes(tenant.plan, module) && tenant.enabledModules.includes(module);
}
