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
import { assertRoleAvailable } from './role-templates.ts';
import { templateFor } from '@clinks/domain/products';

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
				.select(['id', 'tenantId', 'name', 'kind', 'permissions', 'template'])
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
			const access = roleGrants(await activeRole(tx, tenantId, claims.sub), 'team.manage')
				? await this.#access(tx, tenantId)
				: null;
			return {
				roles: roles.map((role) => ({ ...role, permissions: role.permissions as Permission[] })),
				people: members.map(({ email, firstName, lastName, avatarColor, avatarDataUrl, ...membership }) => ({
					membership,
					user: { id: membership.userId, email, firstName, lastName, avatarColor, avatarDataUrl },
					access: access ? (access.get(membership.userId) ?? { lastActiveAt: null, devices: 0 }) : null,
				})),
			};
		});
	}
	/** Last sign-in and signed-in devices per person, from the refresh tokens kept for this workspace. */
	async #access(tx: Tx, tenantId: string) {
		const now = this.#services.now();
		const rows = await tx
			.selectFrom('auth.refreshTokens')
			.select((eb) => [
				'userId',
				eb.fn.max('createdAt').as('lastActiveAt'),
				eb.fn
					.count<number>('familyId')
					.distinct()
					.filterWhere((w) =>
						w.and([w('revokedAt', 'is', null), w('replacedAt', 'is', null), w('expiresAt', '>', now)]),
					)
					.as('devices'),
			])
			.where('tenantId', '=', tenantId)
			.groupBy('userId')
			.execute();
		return new Map(
			rows.map((row) => [
				row.userId,
				{ lastActiveAt: new Date(row.lastActiveAt).toISOString(), devices: Number(row.devices) },
			]),
		);
	}
	/** The membership to change, after checking that the caller may manage both its old and new role. */
	async #managed(tx: Tx, tenantId: string, claims: AccessClaims, id: string, roleId?: string) {
		const current = await tx
			.selectFrom('memberships')
			.selectAll()
			.where('tenantId', '=', tenantId)
			.where('id', '=', id)
			.executeTakeFirst();
		if (!current) throw new ApiError(404, 'error.membership_not_found');
		const next = roleId ?? current.roleId;
		const roles = await tx
			.selectFrom('roles')
			.selectAll()
			.where('tenantId', '=', tenantId)
			.where('id', 'in', [next, current.roleId])
			.execute();
		const target = roles.find((role) => role.id === next);
		if (!target) throw new ApiError(404, 'error.role_not_found');
		if (next !== current.roleId) await assertRoleAvailable(tx, tenantId, target);
		const actor = await activeRole(tx, tenantId, claims.sub);
		if (
			actor?.kind !== 'administrator' &&
			roles.some(
				(role) => role.kind === 'administrator' || role.permissions.some((p) => !roleGrants(actor, p as Permission)),
			)
		)
			throw forbidden();
		const name = (roleId: string) => roles.find((role) => role.id === roleId)?.name ?? '';
		return { current, from: name(current.roleId), to: name(next) };
	}
	/** Ends every sign-in of the person in this workspace; their devices must sign in again. */
	async #signOut(tx: Tx, tenantId: string, userId: string) {
		const revoked = await tx
			.updateTable('auth.refreshTokens')
			.set({ revokedAt: this.#services.now() })
			.where('userId', '=', userId)
			.where('tenantId', '=', tenantId)
			.where('revokedAt', 'is', null)
			.returning('familyId')
			.execute();
		return new Set(revoked.map((row) => row.familyId)).size;
	}
	member(claims: AccessClaims, id: string, input: z.infer<typeof memberUpdate>, caller: Caller | null = null) {
		return this.#tenant(claims, 'team.manage', async (tx, tenantId) => {
			const { releaseVisits, ...changes } = input;
			const { current, from, to } = await this.#managed(tx, tenantId, claims, id, changes.roleId);
			await tx
				.updateTable('memberships')
				.set((tx) => ({ ...changes, revision: tx('revision', '+', 1), updatedAt: this.#services.now() }))
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
			const log = (action: string, meta: Record<string, unknown> = {}) =>
				audit(tx, { tenantId, actorId: claims.sub, action, target: id, meta }, caller);
			if (changes.roleId && changes.roleId !== current.roleId) await log('membership.role_changed', { from, to });
			if (changes.status === 'inactive' && current.status === 'active') {
				const devices = await this.#signOut(tx, tenantId, current.userId);
				const visits = releaseVisits ? await this.#releaseVisits(tx, tenantId, current.userId) : 0;
				await log('membership.deactivated', { devices, visits });
			}
			if (changes.status === 'active' && current.status === 'inactive') await log('membership.reactivated');
			if (changes.jobTitle !== undefined && changes.jobTitle !== current.jobTitle) await log('membership.updated');
		});
	}
	signOut(claims: AccessClaims, id: string, caller: Caller | null = null) {
		return this.#tenant(claims, 'team.manage', async (tx, tenantId) => {
			const { current } = await this.#managed(tx, tenantId, claims, id);
			const devices = await this.#signOut(tx, tenantId, current.userId);
			await audit(
				tx,
				{ tenantId, actorId: claims.sub, action: 'membership.signed_out', target: id, meta: { devices } },
				caller,
			);
		});
	}
	/** Future Spitex visits of someone who leaves go back to the open visits, to be planned again. */
	async #releaseVisits(tx: Tx, tenantId: string, userId: string) {
		const released = await tx
			.updateTable('appointments')
			.set((tx) => ({ assigneeId: null, revision: tx('revision', '+', 1), updatedAt: this.#services.now() }))
			.where('tenantId', '=', tenantId)
			.where('assigneeId', '=', userId)
			.where('kind', '=', 'spitex')
			.where('startsAt', '>=', this.#services.now())
			.returning('id')
			.execute();
		return released.length;
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
	/** A template role goes back to the rights of its template; its name and members stay. */
	resetRole(claims: AccessClaims, id: string, caller: Caller | null = null) {
		return this.#tenant(claims, 'roles.manage', async (tx, tenantId) => {
			const saved = await tx
				.selectFrom('roles')
				.selectAll()
				.where('tenantId', '=', tenantId)
				.where('id', '=', id)
				.executeTakeFirst();
			const template = templateFor(saved?.template);
			if (!saved || !template) throw new ApiError(404, 'error.role_not_found');
			const actor = await activeRole(tx, tenantId, claims.sub);
			if (template.permissions.some((p) => !roleGrants(actor, p))) throw forbidden();
			await tx
				.updateTable('roles')
				.set((tx) => ({
					permissions: [...template.permissions],
					revision: tx('revision', '+', 1),
					updatedAt: this.#services.now(),
				}))
				.where('id', '=', id)
				.execute();
			await audit(tx, { tenantId, actorId: claims.sub, action: 'role.reset', target: id }, caller);
		});
	}
	saveRole(claims: AccessClaims, input: z.infer<typeof roleUpdate>, caller: Caller | null = null) {
		return this.role(claims, input.id ?? uuid(), input, caller);
	}
}
