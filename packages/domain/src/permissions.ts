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
		// `spitex.own.read` → area «spitex_own»; a permission that is its own right (`spitex.release`) is its own area.
		const parts = permission.split('.');
		const action = parts.at(-1)!;
		const grouped = action === 'read' || action === 'write' || action === 'manage';
		const area = (grouped ? parts.slice(0, -1) : parts).join('_');
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
	// Who sees the whole plan also sees their own visits.
	if (permission === 'spitex.own.read' && role.permissions.includes('spitex.read')) return true;
	return role.permissions.includes(permission);
}

export function moduleBooked(tenant: Pick<Tenant, 'plan' | 'enabledModules'>, module: ModuleKey): boolean {
	if (coreModules.includes(module)) return true;
	return planIncludes(tenant.plan, module) && tenant.enabledModules.includes(module);
}
