import { inScope, type Tx } from '@clinks/db/scope';
import { roleGrants } from '@clinks/domain/permissions';
import type { Permission } from '@clinks/domain/types';
import { isValidSwissIban } from '@clinks/domain/qr-bill';
import type { z } from 'zod';
import type { profileUpdate, companyUpdate, roleUpdate, memberUpdate, TeamResponse } from '@clinks/contracts/auth';
import { ApiError, forbidden } from '../errors.ts';
import { uuid } from '../crypto.ts';
import type { AccessClaims } from '../tokens.ts';
import type { Caller, Services } from './context.ts';
import { activeRole } from './permissions.ts';
import { audit } from './audit.ts';

export class SettingsService {
	readonly #services: Services;
	constructor(services: Services) {
		this.#services = services;
	}
	async #tenant<T>(
		claims: AccessClaims,
		permission: Permission | null,
		work: (tx: Tx, tenantId: string) => Promise<T>,
	) {
		const tenantId = claims.tenant_id;
		if (!tenantId) throw forbidden();
		return inScope(this.#services.db, { tenantId, userId: claims.sub }, async (tx) => {
			await tx.selectFrom('tenants').select('id').where('id', '=', tenantId).forUpdate().executeTakeFirstOrThrow();
			const role = await activeRole(tx, tenantId, claims.sub);
			if (
				permission
					? !roleGrants(role, permission)
					: !roleGrants(role, 'team.manage') && !roleGrants(role, 'roles.manage')
			)
				throw forbidden();
			return work(tx, tenantId);
		});
	}
	profile(claims: AccessClaims, input: z.infer<typeof profileUpdate>, caller: Caller | null = null) {
		return inScope(this.#services.db, { tenantId: claims.tenant_id, userId: claims.sub }, async (tx) => {
			await tx
				.updateTable('users')
				.set((tx) => ({ ...input, revision: tx('revision', '+', 1), updatedAt: this.#services.now() }))
				.where('id', '=', claims.sub)
				.execute();
			await audit(
				tx,
				{ tenantId: claims.tenant_id, actorId: claims.sub, action: 'user.updated', target: claims.sub },
				caller,
			);
		});
	}
	company(claims: AccessClaims, input: z.infer<typeof companyUpdate>, caller: Caller | null = null) {
		if (input.iban && !isValidSwissIban(input.iban))
			throw new ApiError(400, 'error.validation', { iban: 'ui.ws.settings.iban_invalid' });
		return this.#tenant(claims, 'settings.manage', async (tx, tenantId) => {
			await tx
				.updateTable('tenants')
				.set((tx) => ({ ...input, revision: tx('revision', '+', 1), updatedAt: this.#services.now() }))
				.where('id', '=', tenantId)
				.execute();
			await audit(tx, { tenantId, actorId: claims.sub, action: 'tenant.updated', target: tenantId }, caller);
		});
	}
	team(claims: AccessClaims): Promise<TeamResponse> {
		return this.#tenant(claims, null, async (tx, tenantId) => {
			const roles = await tx
				.selectFrom('roles')
				.select(['id', 'tenantId', 'name', 'kind', 'permissions'])
				.where('tenantId', '=', tenantId)
				.execute();
			const members = await tx
				.selectFrom('memberships')
				.innerJoin('users', 'users.id', 'memberships.userId')
				.select([
					'memberships.id',
					'tenantId',
					'roleId',
					'userId',
					'status',
					'jobTitle',
					'email',
					'firstName',
					'lastName',
					'avatarColor',
					'avatarDataUrl',
				])
				.where('tenantId', '=', tenantId)
				.execute();
			return {
				roles: roles.map((role) => ({ ...role, permissions: role.permissions as Permission[] })),
				people: members.map(({ email, firstName, lastName, avatarColor, avatarDataUrl, ...membership }) => ({
					membership,
					user: { id: membership.userId, email, firstName, lastName, avatarColor, avatarDataUrl },
				})),
			};
		});
	}
	member(claims: AccessClaims, id: string, input: z.infer<typeof memberUpdate>, caller: Caller | null = null) {
		return this.#tenant(claims, 'team.manage', async (tx, tenantId) => {
			const current = await tx
				.selectFrom('memberships')
				.selectAll()
				.where('tenantId', '=', tenantId)
				.where('id', '=', id)
				.executeTakeFirst();
			if (!current) throw new ApiError(404, 'error.membership_not_found');
			const roleId = input.roleId ?? current.roleId;
			const roles = await tx
				.selectFrom('roles')
				.selectAll()
				.where('tenantId', '=', tenantId)
				.where('id', 'in', [roleId, current.roleId])
				.execute();
			if (!roles.some((role) => role.id === roleId)) throw new ApiError(404, 'error.role_not_found');
			const actor = await activeRole(tx, tenantId, claims.sub);
			if (
				actor?.kind !== 'administrator' &&
				roles.some(
					(role) => role.kind === 'administrator' || role.permissions.some((p) => !roleGrants(actor, p as Permission)),
				)
			)
				throw forbidden();
			await tx
				.updateTable('memberships')
				.set((tx) => ({ ...input, revision: tx('revision', '+', 1), updatedAt: this.#services.now() }))
				.where('id', '=', id)
				.execute();
			const admin = await tx
				.selectFrom('memberships')
				.innerJoin('roles', 'roles.id', 'memberships.roleId')
				.select('memberships.id')
				.where('memberships.tenantId', '=', tenantId)
				.where('memberships.status', '=', 'active')
				.where('roles.kind', '=', 'administrator')
				.executeTakeFirst();
			if (!admin) throw new ApiError(409, 'error.ws.last_administrator');
			await audit(tx, { tenantId, actorId: claims.sub, action: 'membership.updated', target: id }, caller);
		});
	}
	role(claims: AccessClaims, id: string, input?: z.infer<typeof roleUpdate>, caller: Caller | null = null) {
		return this.#tenant(claims, 'roles.manage', async (tx, tenantId) => {
			const saved = await tx
				.selectFrom('roles')
				.selectAll()
				.where('tenantId', '=', tenantId)
				.where('id', '=', id)
				.executeTakeFirst();
			if (!saved && (!input || input.id)) throw new ApiError(404, 'error.role_not_found');
			if (saved && saved.kind !== 'custom') throw new ApiError(403, 'error.ws.protected_role');
			const actor = await activeRole(tx, tenantId, claims.sub);
			if (
				[...(saved?.permissions ?? []), ...(input?.permissions ?? [])].some((p) => !roleGrants(actor, p as Permission))
			)
				throw forbidden();
			if (!input) {
				const used = await tx.selectFrom('memberships').select('id').where('roleId', '=', id).executeTakeFirst();
				const invited = await tx.selectFrom('invitations').select('id').where('roleId', '=', id).executeTakeFirst();
				if (used || invited) throw new ApiError(409, 'error.ws.role_in_use');
				await tx.deleteFrom('roles').where('id', '=', id).execute();
			} else if (saved) {
				await tx
					.updateTable('roles')
					.set((tx) => ({
						name: input.name,
						permissions: input.permissions,
						revision: tx('revision', '+', 1),
						updatedAt: this.#services.now(),
					}))
					.where('id', '=', id)
					.execute();
			} else
				await tx
					.insertInto('roles')
					.values({ tenantId, id, kind: 'custom', name: input.name, permissions: input.permissions })
					.execute();
			await audit(
				tx,
				{
					tenantId,
					actorId: claims.sub,
					action: input ? (saved ? 'role.updated' : 'role.created') : 'role.deleted',
					target: id,
				},
				caller,
			);
			return { id };
		});
	}
	saveRole(claims: AccessClaims, input: z.infer<typeof roleUpdate>, caller: Caller | null = null) {
		return this.role(claims, input.id ?? uuid(), input, caller);
	}
}
