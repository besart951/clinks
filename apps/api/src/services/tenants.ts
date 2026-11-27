import { activeRole } from './permissions.ts';
import type { CreateTenantRequest, InvitationDetails, MeResponse } from '@clinks/contracts/auth';
import { administratorPermissions, roleGrants, userPermissions } from '@clinks/domain/permissions';
import type { Permission } from '@clinks/domain/types';
import type { InvitationRow, RoleRow, TenantRow, UserRow } from '@clinks/db/schema';
import { inScope, type Tx } from '@clinks/db/scope';
import { uuid } from '../crypto.ts';
import { ApiError, forbidden, unauthorized } from '../errors.ts';
import { translate } from '../i18n.ts';
import { hashPassword } from '../passwords.ts';
import { enforceRateLimit } from '../rate-limit.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import { addRoleTemplates, assertRoleAvailable } from './role-templates.ts';
import type { Caller, Services } from './context.ts';
import { findLink, issueLink, lifetimes, useUp } from './one-time.ts';
import type { OpenedSession, SessionService } from './sessions.ts';

const trialDays = 14;

/** The signed-in user's account, tenants created at onboarding, and invitations into a tenant. */
export class TenantService {
	readonly #services: Services;
	readonly #sessions: SessionService;

	constructor(services: Services, sessions: SessionService) {
		this.#services = services;
		this.#sessions = sessions;
	}

	async me(claims: AccessClaims): Promise<MeResponse> {
		return inScope(this.#services.db, { tenantId: claims.tenant_id, userId: claims.sub }, async (tx) => {
			const user = await tx.selectFrom('users').selectAll().where('id', '=', claims.sub).executeTakeFirst();
			if (!user) throw unauthorized();
			const credentials = await tx
				.selectFrom('auth.credentials')
				.select('totpEnabledAt')
				.where('userId', '=', claims.sub)
				.executeTakeFirst();
			const memberships = await tx
				.selectFrom('memberships')
				.selectAll()
				.where('userId', '=', claims.sub)
				.orderBy('createdAt')
				.execute();
			const tenantIds = memberships.map((membership) => membership.tenantId);
			const tenants = tenantIds.length
				? await tx.selectFrom('tenants').selectAll().where('id', 'in', tenantIds).execute()
				: [];
			const roleIds = memberships.map((membership) => membership.roleId);
			const roles = roleIds.length ? await tx.selectFrom('roles').selectAll().where('id', 'in', roleIds).execute() : [];
			return {
				user: userDto(user, credentials?.totpEnabledAt != null),
				tenantId: claims.tenant_id,
				tenants: tenants.map(tenantDto),
				roles: roles.map(roleDto),
				memberships: memberships.map(({ id, tenantId, userId, roleId, status, jobTitle }) => ({
					id,
					tenantId,
					userId,
					roleId,
					status,
					jobTitle,
				})),
			};
		});
	}

	/** Onboarding: a new tenant with the two built-in roles, and the caller as its administrator. */
	async create(claims: AccessClaims, input: CreateTenantRequest, caller: Caller): Promise<{ tenantId: string }> {
		const tenantId = uuid();
		const now = this.#services.now();
		await inScope(this.#services.db, { tenantId, userId: claims.sub }, async (tx) => {
			await tx
				.insertInto('tenants')
				.values({
					id: tenantId,
					name: input.name,
					industry: input.industry,
					plan: 'business',
					enabledModules: [...new Set(input.modules)],
					trialEndsAt: new Date(now.getTime() + trialDays * 86_400_000),
					onboardingCompleted: true,
				})
				.execute();
			const administrator = uuid();
			await tx
				.insertInto('roles')
				.values([
					{
						id: administrator,
						tenantId,
						name: translate(caller.locale, 'ui.ws.roles.default_administrator'),
						kind: 'administrator',
						permissions: [...administratorPermissions],
					},
					{
						id: uuid(),
						tenantId,
						name: translate(caller.locale, 'ui.ws.roles.default_user'),
						kind: 'user',
						permissions: [...userPermissions],
					},
				])
				.execute();
			await tx
				.insertInto('memberships')
				.values({ id: uuid(), tenantId, userId: claims.sub, roleId: administrator })
				.execute();
			await addRoleTemplates(tx, tenantId);
			await audit(tx, { action: 'tenant.created', actorId: claims.sub, tenantId }, caller);
		});
		return { tenantId };
	}

	async invitations(claims: AccessClaims) {
		return this.#asManager(claims, async (tx, tenantId) => {
			const rows = await tx
				.selectFrom('invitations')
				.selectAll()
				.where('tenantId', '=', tenantId)
				.orderBy('createdAt', 'desc')
				.execute();
			return rows.map(invitationDto);
		});
	}

	async invite(claims: AccessClaims, input: { email: string; roleId: string }, caller: Caller) {
		this.#limit(`invite:user:${claims.sub}`, 20);
		const { now } = this.#services;
		const { invitation, token, tenantName } = await this.#asManager(claims, async (tx, tenantId) => {
			this.#limit(`invite:tenant:${tenantId}`, 30);
			const role = await tx
				.selectFrom('roles')
				.select(['id', 'permissions', 'kind', 'template'])
				.where('id', '=', input.roleId)
				.where('tenantId', '=', tenantId)
				.executeTakeFirst();
			if (!role) throw new ApiError(404, 'error.role_not_found', { roleId: 'error.role_not_found' });
			await assertRoleAvailable(tx, tenantId, role);
			const actor = await activeRole(tx, tenantId, claims.sub);
			if (
				actor?.kind !== 'administrator' &&
				(role.kind === 'administrator' || role.permissions.some((p) => !roleGrants(actor, p as Permission)))
			)
				throw forbidden();
			const member = await tx
				.selectFrom('memberships')
				.innerJoin('users', 'users.id', 'memberships.userId')
				.select('memberships.id')
				.where('memberships.tenantId', '=', tenantId)
				.where('users.email', '=', input.email)
				.executeTakeFirst();
			if (member) throw new ApiError(409, 'error.ws.already_member', { email: 'error.ws.already_member' });
			const id = uuid();
			const row = await tx
				.insertInto('invitations')
				.values({
					id,
					tenantId,
					email: input.email,
					roleId: input.roleId,
					expiresAt: new Date(now().getTime() + lifetimes.invitation),
					invitedBy: claims.sub,
				})
				.returningAll()
				.executeTakeFirstOrThrow();
			const link = await issueLink(tx, { purpose: 'invitation', invitationId: id, tenantId, now: now() });
			const tenant = await tx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirstOrThrow();
			await audit(tx, { action: 'invitation.created', actorId: claims.sub, tenantId, target: id }, caller);
			return { invitation: row, token: link.token, tenantName: tenant.name };
		});
		await this.#sendInvitation(input.email, tenantName, token, caller);
		return invitationDto(invitation);
	}

	async resend(claims: AccessClaims, id: string, caller: Caller) {
		this.#limit(`invite:user:${claims.sub}`, 20);
		this.#limit(`invite:resend:${id}`, 5);
		const { email, tenantName, token } = await this.#asManager(claims, async (tx, tenantId) => {
			const row = await tx
				.updateTable('invitations')
				.set({ expiresAt: new Date(this.#services.now().getTime() + lifetimes.invitation) })
				.where('tenantId', '=', tenantId)
				.where('id', '=', id)
				.where('status', '=', 'pending')
				.returning('email')
				.executeTakeFirst();
			if (!row) throw new ApiError(404, 'error.invitation_invalid');
			await tx
				.updateTable('auth.oneTimeTokens')
				.set({ usedAt: this.#services.now() })
				.where('invitationId', '=', id)
				.where('usedAt', 'is', null)
				.execute();
			const link = await issueLink(tx, {
				purpose: 'invitation',
				invitationId: id,
				tenantId,
				now: this.#services.now(),
			});
			const tenant = await tx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirstOrThrow();
			await audit(tx, { tenantId, actorId: claims.sub, action: 'invitation.resent', target: id }, caller);
			return { email: row.email, tenantName: tenant.name, token: link.token };
		});
		await this.#sendInvitation(email, tenantName, token, caller);
	}
	async #sendInvitation(email: string, tenantName: string, token: string, caller: Caller) {
		await this.#services.mailer.send({
			to: email,
			subject: translate(caller.locale, 'mail.invitation.subject', { tenant: tenantName }),
			text: translate(caller.locale, 'mail.invitation.body', {
				tenant: tenantName,
				link: `${this.#services.config.WEB_ORIGIN}/#/invitation/${encodeURIComponent(token)}`,
			}),
		});
	}

	async revokeInvitation(claims: AccessClaims, id: string, caller: Caller) {
		await this.#asManager(claims, async (tx, tenantId) => {
			const current = this.#services.now();
			const revoked = await tx
				.updateTable('invitations')
				.set({ status: 'revoked', updatedAt: current })
				.where('id', '=', id)
				.where('tenantId', '=', tenantId)
				.where('status', '=', 'pending')
				.executeTakeFirst();
			if (revoked.numUpdatedRows === 0n) throw new ApiError(404, 'error.invitation_invalid');
			await tx
				.updateTable('auth.oneTimeTokens')
				.set({ usedAt: current })
				.where('invitationId', '=', id)
				.where('usedAt', 'is', null)
				.execute();
			await audit(tx, { action: 'invitation.revoked', actorId: claims.sub, tenantId, target: id }, caller);
		});
	}

	async invitationDetails(token: string): Promise<InvitationDetails> {
		const { invitation, tenant, role } = await this.#openInvitation(token);
		const account = await this.#services.db
			.selectFrom('users')
			.select('id')
			.where('email', '=', invitation.email)
			.executeTakeFirst();
		return {
			tenantName: tenant.name,
			email: invitation.email,
			roleName: role.name,
			expiresAt: invitation.expiresAt.toISOString(),
			hasAccount: account !== undefined,
		};
	}

	/**
	 * An existing account must be signed in as the invited address. A new address chooses a password
	 * here; the link proves the mailbox, so the account starts verified and is signed in at once.
	 */
	async acceptInvitation(
		token: string,
		input: { firstName: string; lastName: string; password?: string },
		claims: AccessClaims | null,
		caller: Caller,
	): Promise<{ tenantId: string; session?: OpenedSession }> {
		const { db, now } = this.#services;
		const { invitation, linkId } = await this.#openInvitation(token);
		const existing = await db.selectFrom('users').select('id').where('email', '=', invitation.email).executeTakeFirst();
		if (existing && claims?.sub !== existing.id) {
			// A second, simultaneous accept finds the account the first one just created: the link is used, not foreign.
			await this.#openInvitation(token);
			throw new ApiError(403, 'error.invite_email_mismatch');
		}
		if (!existing && !input.password)
			throw new ApiError(400, 'error.validation', { password: 'error.ws.password_too_short' });
		const userId = existing?.id ?? uuid();
		const passwordHash = existing ? null : await hashPassword(input.password!);
		await inScope(db, { tenantId: invitation.tenantId, userId }, async (tx) => {
			const current = now();
			if (!(await useUp(tx, linkId, current))) throw new ApiError(409, 'error.invitation_used');
			const accepted = await tx
				.updateTable('invitations')
				.set({ status: 'accepted', updatedAt: current })
				.where('id', '=', invitation.id)
				.where('status', '=', 'pending')
				.executeTakeFirst();
			if (accepted.numUpdatedRows === 0n) throw new ApiError(409, 'error.invitation_used');
			if (passwordHash) {
				await tx
					.insertInto('users')
					.values({
						id: userId,
						email: invitation.email,
						firstName: input.firstName,
						lastName: input.lastName,
						locale: caller.locale,
						globalRole: null,
						emailVerifiedAt: current,
					})
					.execute();
				await tx
					.insertInto('auth.credentials')
					.values({ userId, passwordHash, totpSecret: null, totpEnabledAt: null, lockedUntil: null })
					.execute();
			}
			await tx
				.insertInto('memberships')
				.values({ id: uuid(), tenantId: invitation.tenantId, userId, roleId: invitation.roleId })
				.execute();
			await audit(
				tx,
				{ action: 'invitation.accepted', actorId: userId, tenantId: invitation.tenantId, target: invitation.id },
				caller,
			);
		});
		return existing
			? { tenantId: invitation.tenantId }
			: { tenantId: invitation.tenantId, session: await this.#sessions.open(userId, caller, invitation.tenantId) };
	}

	#limit(key: string, limit: number) {
		enforceRateLimit(this.#services.limiter, key, limit);
	}

	/** Runs `work` in the caller's tenant, if their membership there may manage the team. */
	async #asManager<T>(claims: AccessClaims, work: (tx: Tx, tenantId: string) => Promise<T>): Promise<T> {
		const tenantId = claims.tenant_id;
		if (!tenantId) throw forbidden();
		return inScope(this.#services.db, { tenantId, userId: claims.sub }, async (tx) => {
			// The current membership counts, not the role in the token: it may be up to 15 minutes old.
			const role = await tx
				.selectFrom('memberships')
				.innerJoin('roles', 'roles.id', 'memberships.roleId')
				.select(['roles.kind', 'roles.permissions'])
				.where('memberships.tenantId', '=', tenantId)
				.where('memberships.userId', '=', claims.sub)
				.where('memberships.status', '=', 'active')
				.executeTakeFirst();
			if (!role || !roleGrants({ kind: role.kind, permissions: role.permissions as Permission[] }, 'team.manage'))
				throw forbidden();
			return work(tx, tenantId);
		});
	}

	/** The pending invitation behind a link, with its tenant and role; the link names no tenant itself. */
	async #openInvitation(token: string) {
		const { db, now } = this.#services;
		const link = await findLink(db, 'invitation', token, now());
		if (!link?.tenantId || !link.invitationId) throw new ApiError(404, 'error.invitation_invalid');
		const { tenantId, invitationId } = link;
		return inScope(db, { tenantId, userId: null }, async (tx) => {
			const invitation = await tx
				.selectFrom('invitations')
				.selectAll()
				.where('id', '=', invitationId)
				.executeTakeFirst();
			if (!invitation || invitation.status === 'revoked') throw new ApiError(404, 'error.invitation_invalid');
			if (invitation.status === 'accepted') throw new ApiError(409, 'error.invitation_used');
			if (invitation.expiresAt <= now()) throw new ApiError(410, 'error.invitation_expired');
			const tenant = await tx.selectFrom('tenants').selectAll().where('id', '=', tenantId).executeTakeFirstOrThrow();
			const role = await tx
				.selectFrom('roles')
				.selectAll()
				.where('id', '=', invitation.roleId)
				.executeTakeFirstOrThrow();
			return { invitation, tenant, role, linkId: link.id };
		});
	}
}

function userDto(user: UserRow, twoFactorEnabled: boolean) {
	const { id, email, firstName, lastName, avatarColor, locale, globalRole } = user;
	return {
		id,
		email,
		firstName,
		lastName,
		avatarColor,
		locale,
		globalRole,
		avatarDataUrl: user.avatarDataUrl,
		notificationPreferences: user.notificationPreferences,
		mailSignature: user.mailSignature,
		emailVerified: user.emailVerifiedAt !== null,
		twoFactorEnabled,
	};
}

function tenantDto(tenant: TenantRow): MeResponse['tenants'][number] {
	return {
		id: tenant.id,
		name: tenant.name,
		industry: tenant.industry,
		brandColor: tenant.brandColor,
		logoDataUrl: tenant.logoDataUrl,
		address: tenant.address,
		vatNumber: tenant.vatNumber,
		iban: tenant.iban,
		qrIban: tenant.qrIban,
		invoiceSettings: tenant.invoiceSettings,
		locale: tenant.locale,
		timeZone: tenant.timeZone,
		plan: tenant.plan,
		billingCycle: tenant.billingCycle,
		trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
		enabledModules: tenant.enabledModules as MeResponse['tenants'][number]['enabledModules'],
		featureFlags: tenant.featureFlags,
		onboardingCompleted: tenant.onboardingCompleted,
	};
}

function roleDto(role: RoleRow): MeResponse['roles'][number] {
	return {
		id: role.id,
		tenantId: role.tenantId,
		name: role.name,
		kind: role.kind,
		permissions: role.permissions as Permission[],
		template: role.template,
	};
}

function invitationDto(row: InvitationRow) {
	return {
		id: row.id,
		invitedBy: row.invitedBy,
		createdAt: row.createdAt.toISOString(),
		email: row.email,
		roleId: row.roleId,
		status: row.status,
		expiresAt: row.expiresAt.toISOString(),
	};
}
