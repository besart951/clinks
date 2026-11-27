import type { Db } from '@clinks/db/client';
import { inScope, type Tx } from '@clinks/db/scope';
import type { Permission, RoleKind } from '@clinks/domain/types';
import { roleGrants } from '@clinks/domain/permissions';
import { forbidden } from '../errors.ts';
type Role = { kind: RoleKind; permissions: Permission[] };
/** The role of the caller's active membership; the token's role claim may be up to 15 minutes old. */
export async function activeRole(tx: Tx, tenantId: string, userId: string): Promise<Role | null> {
	const row = await tx
		.selectFrom('memberships')
		.innerJoin('roles', 'roles.id', 'memberships.roleId')
		.select(['roles.kind', 'roles.permissions'])
		.where('memberships.tenantId', '=', tenantId)
		.where('memberships.userId', '=', userId)
		.where('memberships.status', '=', 'active')
		.executeTakeFirst();
	return row ? { kind: row.kind, permissions: row.permissions as Permission[] } : null;
}
export async function requirePermission(tx: Tx, tenantId: string, userId: string, permission: Permission) {
	const role = await activeRole(tx, tenantId, userId);
	if (!role || !roleGrants(role, permission)) throw forbidden();
}

/** The tenant and user a signed-in request acts for. */
export type MemberScope = { tenantId: string; userId: string };

/** Runs `work` in the caller's workspace once its active role grants `permission`. */
export function withPermission<T>(
	db: Db,
	claims: { tenant_id?: string | null; sub: string },
	permission: Permission,
	work: (tx: Tx, scope: MemberScope) => Promise<T>,
): Promise<T> {
	if (!claims.tenant_id) throw forbidden();
	const scope = { tenantId: claims.tenant_id, userId: claims.sub };
	return inScope(db, scope, async (tx) => {
		await requirePermission(tx, scope.tenantId, scope.userId, permission);
		return work(tx, scope);
	});
}
