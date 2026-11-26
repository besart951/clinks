import { addDays, toCalendarDate } from '@clinks/domain/dates';
import {
	newId,
	type InvitationId,
	type MembershipId,
	type RoleId,
	type SessionId,
	type TenantId,
	type UserId,
} from '@clinks/domain/ids';
import { administratorPermissions, roleGrants, userPermissions } from '@clinks/domain/permissions';
import { planFor, priceFor } from '@clinks/domain/plans';
import type {
	Invitation,
	Membership,
	NotificationPreferences,
	Permission,
	PlanCode,
	Rappen,
	Role,
	Tenant,
	User,
} from '@clinks/domain/types';
import { MockApiError, stamp, type WorkspaceCache, type Snapshot, type TableName } from './database.ts';
import { appendAudit, validationError } from './repository.ts';
import { demoPassword } from './seed.ts';
import type { NewTenant } from '../session/auth-gateway.ts';
import { invitationSchema, roleSchema, storageSettingsSchema } from '@clinks/contracts/schemas';
import {
	dataLocation,
	needsLocationConsent,
	type StorageCheck,
	type StorageSettings,
	type StorageSettingsInput,
	type StorageSettingsView,
} from '@clinks/domain/storage';

export interface Caller {
	userId(): UserId | null;
	tenantId(): TenantId | null;
	localize(key: string): string;
}

export interface Member {
	membership: Membership;
	user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'avatarColor' | 'avatarDataUrl'>;
	role: Role;
	/** Last sign-in and signed-in devices; only for those who manage the team. */
	access: MemberAccess | null;
}

export interface MemberAccess {
	lastActiveAt: string | null;
	devices: number;
}

export interface MemberChanges {
	roleId?: RoleId;
	status?: 'active' | 'inactive';
	jobTitle?: string;
	/** With `status: 'inactive'`: future Spitex visits go back to the open visits. */
	releaseVisits?: boolean;
}

export interface PlatformInvoice {
	number: string;
	date: string;
	amount: Rappen;
	status: 'paid' | 'open';
}

export interface TenantOverview {
	tenant: Tenant;
	members: number;
	contacts: number;
	invoices: number;
}

export function roleFor(db: WorkspaceCache, userId: UserId | null, tenantId: TenantId | null): Role | null {
	if (!userId || !tenantId) return null;
	const membership = db
		.table('memberships')
		.find((row) => row.userId === userId && row.tenantId === tenantId && row.status === 'active');
	return membership ? (db.table('roles').find((role) => role.id === membership.roleId) ?? null) : null;
}

/** Accounts, tenants, memberships and billing: the control-plane part of the mock API. */
export class AccountApi {
	#db: WorkspaceCache;
	#caller: Caller;

	constructor(db: WorkspaceCache, caller: Caller) {
		this.#db = db;
		this.#caller = caller;
	}

	signIn(email: string, password: string): Promise<User> {
		return this.#db.request(() => {
			const user = this.#db.table('users').find((row) => row.email.toLowerCase() === email.trim().toLowerCase());
			if (!user || user.password !== password)
				throw new MockApiError('unauthorized', this.#localize('error.invalid_credentials'));
			return user;
		});
	}

	verifyTwoFactor(code: string): Promise<void> {
		return this.#db.request(() => {
			if (code.trim() !== '123456') throw new MockApiError('validation', this.#localize('error.ws.invalid_code'));
		});
	}

	signUp(input: { firstName: string; lastName: string; email: string; password: string }): Promise<User> {
		return this.#db.request(() => {
			const email = input.email.trim().toLowerCase();
			const fields: { [field: string]: string } = {};
			if (!input.firstName.trim()) fields.firstName = this.#localize('error.ws.required');
			if (!input.lastName.trim()) fields.lastName = this.#localize('error.ws.required');
			if (!/^\S+@\S+\.\S+$/.test(email)) fields.email = this.#localize('error.ws.invalid_email');
			if (input.password.length < 8) fields.password = this.#localize('error.ws.password_too_short');
			if (this.#db.table('users').some((row) => row.email === email))
				fields.email = this.#localize('error.email_taken');
			if (Object.keys(fields).length > 0)
				throw new MockApiError('validation', this.#localize('error.validation'), fields);
			const user = stamp<User>({
				id: newId(),
				email,
				firstName: input.firstName.trim(),
				lastName: input.lastName.trim(),
				avatarColor: '#0f766e',
				avatarDataUrl: null,
				password: input.password,
				emailVerified: false,
				twoFactorEnabled: false,
				locale: 'de-CH',
				globalRole: null,
				notificationPreferences: { inApp: true, email: true, push: false, digest: 'daily' },
			});
			this.#db.table('users').push(user);
			return user;
		}, ['users']);
	}

	verifyEmail(userId: UserId, code: string): Promise<User> {
		return this.#db.request(() => {
			if (code.trim() !== '000000') throw new MockApiError('validation', this.#localize('error.ws.invalid_code'));
			return this.#patchUser(userId, { emailVerified: true });
		}, ['users']);
	}

	requestPasswordReset(_email: string): Promise<void> {
		return this.#db.request(() => undefined);
	}

	/** The demo mail is never sent; its code is always 000000. */
	resetPassword(email: string, code: string, password: string): Promise<void> {
		return this.#db.request(() => {
			if (code.trim() !== '000000') {
				throw new MockApiError('validation', this.#localize('error.ws.invalid_code'), {
					code: this.#localize('error.ws.invalid_code'),
				});
			}
			if (password.length < 8) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					password: this.#localize('error.ws.password_too_short'),
				});
			}
			const user = this.#db.table('users').find((row) => row.email === email.trim().toLowerCase());
			if (user) this.#patchUser(user.id, { password });
		}, ['users']);
	}

	snapshotFor(userId: UserId): Promise<{ user: User; memberships: Membership[]; tenants: Tenant[]; roles: Role[] }> {
		return this.#db.request(() => {
			const user = this.#db.table('users').find((row) => row.id === userId);
			if (!user) throw new MockApiError('unauthorized', this.#localize('error.unauthorized'));
			const memberships = this.#db
				.table('memberships')
				.filter((row) => row.userId === userId && row.status === 'active');
			const tenantIds = new Set(memberships.map((row) => row.tenantId));
			return {
				user,
				memberships,
				tenants: this.#db.table('tenants').filter((row) => tenantIds.has(row.id)),
				roles: this.#db.table('roles').filter((row) => tenantIds.has(row.tenantId)),
			};
		});
	}

	completeOnboarding(input: NewTenant, seedDemo: (tenantId: TenantId) => Partial<Snapshot>): Promise<Tenant> {
		return this.#db.request(() => {
			const userId = this.#requireUser();
			if (!input.companyName.trim()) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					companyName: this.#localize('error.ws.required'),
				});
			}
			const tenant = stamp<Tenant>({
				id: newId(),
				name: input.companyName.trim(),
				industry: input.industry,
				brandColor: input.industry === 'spitex' ? '#7c3aed' : '#0f766e',
				logoDataUrl: null,
				address: { street: '', houseNumber: '', zip: '', city: '' },
				vatNumber: '',
				iban: '',
				locale: 'de-CH',
				timeZone: 'Europe/Zurich',
				plan: 'business',
				billingCycle: 'monthly',
				trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
				cancelledAt: null,
				enabledModules: input.modules,
				paymentMethod: null,
				featureFlags: [],
				onboardingCompleted: true,
			});
			this.#db.table('tenants').push(tenant);
			const administrator = this.#insertRole(tenant.id, 'Administrator', 'administrator', administratorPermissions);
			const user = this.#insertRole(tenant.id, 'Benutzer', 'user', userPermissions);
			this.#db.table('memberships').push(
				stamp<Membership>({
					id: newId(),
					tenantId: tenant.id,
					userId,
					roleId: administrator.id,
					status: 'active',
					jobTitle: '',
				}),
			);
			for (const email of input.invites.map((value) => value.trim().toLowerCase()).filter(Boolean)) {
				this.#insertInvitation(tenant.id, email, user.id, userId);
			}
			if (input.demoData) {
				const rows = seedDemo(tenant.id);
				for (const [name, values] of Object.entries(rows))
					this.#db.table(name as TableName).push(...(values as never[]));
			}
			appendAudit(this.#db, {
				tenantId: tenant.id,
				actorId: userId,
				action: 'tenant.created',
				target: { kind: 'tenant', id: tenant.id, label: tenant.name },
			});
			return tenant;
		}, ['tenants', 'roles', 'memberships', 'invitations', 'contacts', 'appointments', 'tasks', 'audit']);
	}

	updateTenant(changes: Partial<Omit<Tenant, 'id' | 'revision' | 'createdAt' | 'updatedAt'>>): Promise<Tenant> {
		return this.#db.request(
			() => this.#mutateTenant('settings.manage', 'tenant.updated', changes),
			['tenants', 'audit'],
		);
	}

	updateProfile(changes: {
		firstName?: string;
		lastName?: string;
		email?: string;
		locale?: string;
		avatarDataUrl?: string | null;
		notificationPreferences?: NotificationPreferences;
	}): Promise<User> {
		return this.#db.request(() => {
			const userId = this.#requireUser();
			if (changes.firstName !== undefined && !changes.firstName.trim()) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					firstName: this.#localize('error.ws.required'),
				});
			}
			if (changes.email !== undefined && !/^\S+@\S+\.\S+$/.test(changes.email)) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					email: this.#localize('error.ws.invalid_email'),
				});
			}
			return this.#patchUser(userId, changes);
		}, ['users']);
	}

	changePassword(current: string, next: string): Promise<void> {
		return this.#db.request(() => {
			const userId = this.#requireUser();
			const user = this.#db.table('users').find((row) => row.id === userId);
			if (!user || user.password !== current) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					current: this.#localize('error.ws.wrong_password'),
				});
			}
			if (next.length < 8) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					next: this.#localize('error.ws.password_too_short'),
				});
			}
			this.#patchUser(userId, { password: next });
		}, ['users']);
	}

	setTwoFactor(enabled: boolean, code: string): Promise<User> {
		return this.#db.request(() => {
			if (enabled && code.trim() !== '123456') {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					code: this.#localize('error.ws.invalid_code'),
				});
			}
			return this.#patchUser(this.#requireUser(), { twoFactorEnabled: enabled });
		}, ['users']);
	}

	sessions() {
		return this.#db.request(() =>
			this.#db.table('sessions').filter((row) => row.userId === this.#requireUser() && !row.endedAt),
		);
	}

	revokeSession(id: SessionId): Promise<void> {
		return this.#db.request(() => {
			const userId = this.#requireUser();
			this.#db.replace(
				'sessions',
				this.#db.table('sessions').filter((row) => !(row.id === id && row.userId === userId)),
			);
		}, ['sessions']);
	}

	members(): Promise<{ members: Member[]; invitations: Invitation[]; roles: Role[] }> {
		return this.#db.request(() => {
			const tenantId = this.#requireTenant();
			const roles = this.#db.table('roles').filter((row) => row.tenantId === tenantId);
			const manages = roleGrants(roleFor(this.#db, this.#caller.userId(), tenantId), 'team.manage');
			const members = this.#db
				.table('memberships')
				.filter((row) => row.tenantId === tenantId)
				.flatMap((membership) => {
					const user = this.#db.table('users').find((row) => row.id === membership.userId);
					const role = roles.find((row) => row.id === membership.roleId);
					const access = manages ? this.#access(membership.userId) : null;
					return user && role ? [{ membership, user, role, access }] : [];
				});
			const invitations = this.#db
				.table('invitations')
				.filter((row) => row.tenantId === tenantId && row.status === 'pending');
			return { members, invitations, roles };
		});
	}

	invite(email: string, roleId: RoleId): Promise<Invitation> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('team.manage');
			const error = validationError(invitationSchema, { email }, (key) => this.#localize(key));
			if (error) throw error;
			const normalized = email.trim().toLowerCase();
			const memberIds = this.#db
				.table('memberships')
				.filter((row) => row.tenantId === tenantId && row.status === 'active')
				.map((row) => row.userId);
			if (this.#db.table('users').some((row) => memberIds.includes(row.id) && row.email === normalized)) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					email: this.#localize('error.ws.already_member'),
				});
			}
			const invitation = this.#insertInvitation(tenantId, normalized, roleId, this.#requireUser());
			this.#audit(tenantId, 'invitation.created', 'invitation', invitation.id, normalized);
			return invitation;
		}, ['invitations', 'audit']);
	}

	resendInvitation(id: InvitationId): Promise<void> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('team.manage');
			this.#db.replace(
				'invitations',
				this.#db
					.table('invitations')
					.map((row) =>
						row.id === id && row.tenantId === tenantId
							? { ...row, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), revision: row.revision + 1 }
							: row,
					),
			);
		}, ['invitations']);
	}

	revokeInvitation(id: InvitationId): Promise<void> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('team.manage');
			const invitation = this.#db.table('invitations').find((row) => row.id === id && row.tenantId === tenantId);
			if (!invitation) throw new MockApiError('not_found', this.#localize('error.invitation_invalid'));
			this.#db.replace(
				'invitations',
				this.#db.table('invitations').map((row) => (row.id === id ? { ...row, status: 'revoked' as const } : row)),
			);
			this.#audit(tenantId, 'invitation.revoked', 'invitation', id, invitation.email);
		}, ['invitations', 'audit']);
	}

	/** Public view of an invitation link: which workspace, which role, for which address. */
	invitationDetails(
		id: InvitationId,
	): Promise<{ invitation: Invitation; tenantName: string; roleName: string; existingUser: boolean }> {
		return this.#db.request(() => {
			const invitation = this.#db.table('invitations').find((row) => row.id === id);
			if (!invitation || invitation.status !== 'pending')
				throw new MockApiError('not_found', this.#localize('error.invitation_invalid'));
			if (new Date(invitation.expiresAt) < new Date())
				throw new MockApiError('validation', this.#localize('error.invitation_expired'));
			return {
				invitation,
				tenantName: this.#db.table('tenants').find((row) => row.id === invitation.tenantId)?.name ?? '',
				roleName: this.#db.table('roles').find((row) => row.id === invitation.roleId)?.name ?? '',
				existingUser: this.#db.table('users').some((row) => row.email === invitation.email),
			};
		});
	}

	/** Simulates the invitee clicking the link in the email, so the flow can be tried without a mailbox. */
	acceptInvitation(
		id: InvitationId,
		name: { firstName: string; lastName: string; password?: string },
	): Promise<Membership> {
		return this.#db.request(() => {
			const invitation = this.#db.table('invitations').find((row) => row.id === id && row.status === 'pending');
			if (!invitation) throw new MockApiError('not_found', this.#localize('error.invitation_invalid'));
			if (new Date(invitation.expiresAt) < new Date())
				throw new MockApiError('validation', this.#localize('error.invitation_expired'));
			let user = this.#db.table('users').find((row) => row.email === invitation.email);
			if (!user) {
				user = stamp<User>({
					id: newId(),
					email: invitation.email,
					firstName: name.firstName || invitation.email.split('@')[0],
					lastName: name.lastName,
					avatarColor: '#1d4ed8',
					avatarDataUrl: null,
					password: name.password ?? demoPassword,
					emailVerified: true,
					twoFactorEnabled: false,
					locale: 'de-CH',
					globalRole: null,
					notificationPreferences: { inApp: true, email: true, push: false, digest: 'daily' },
				});
				this.#db.table('users').push(user);
			}
			const membership = stamp<Membership>({
				id: newId(),
				tenantId: invitation.tenantId,
				userId: user.id,
				roleId: invitation.roleId,
				status: 'active',
				jobTitle: '',
			});
			this.#db.table('memberships').push(membership);
			this.#db.replace(
				'invitations',
				this.#db.table('invitations').map((row) => (row.id === id ? { ...row, status: 'accepted' as const } : row)),
			);
			this.#audit(invitation.tenantId, 'invitation.accepted', 'invitation', id, invitation.email, invitation.invitedBy);
			return membership;
		}, ['users', 'memberships', 'invitations', 'audit']);
	}

	changeMember(id: MembershipId, { releaseVisits, ...changes }: MemberChanges): Promise<Membership> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('team.manage');
			const membership = this.#db.table('memberships').find((row) => row.id === id && row.tenantId === tenantId);
			if (!membership) throw new MockApiError('not_found', this.#localize('error.membership_not_found'));
			const next = {
				...membership,
				...changes,
				revision: membership.revision + 1,
				updatedAt: new Date().toISOString(),
			};
			this.#protectFinalAdministrator(tenantId, membership, next);
			this.#db.replace(
				'memberships',
				this.#db.table('memberships').map((row) => (row.id === id ? next : row)),
			);
			const label = this.#memberLabel(membership.userId);
			const log = (verb: string) => this.#audit(tenantId, `membership.${verb}`, 'membership', id, label);
			if (changes.roleId && changes.roleId !== membership.roleId) log('role_changed');
			if (changes.status === 'inactive' && membership.status === 'active') {
				this.#signOut(membership.userId);
				if (releaseVisits) this.#releaseVisits(tenantId, membership.userId);
				log('deactivated');
			}
			if (changes.status === 'active' && membership.status === 'inactive') log('reactivated');
			if (changes.jobTitle !== undefined && changes.jobTitle !== membership.jobTitle) log('updated');
			return next;
		}, ['memberships', 'audit', 'sessions', 'appointments']);
	}

	/** Ends every sign-in of the person; their devices must sign in again. */
	signOutMember(id: MembershipId): Promise<void> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('team.manage');
			const membership = this.#db.table('memberships').find((row) => row.id === id && row.tenantId === tenantId);
			if (!membership) throw new MockApiError('not_found', this.#localize('error.membership_not_found'));
			this.#signOut(membership.userId);
			this.#audit(tenantId, 'membership.signed_out', 'membership', id, this.#memberLabel(membership.userId));
		}, ['sessions', 'audit']);
	}

	#access(userId: UserId): MemberAccess {
		const sessions = this.#db.table('sessions').filter((row) => row.userId === userId);
		const last =
			sessions
				.map((row) => row.lastActiveAt)
				.sort()
				.at(-1) ?? null;
		return { lastActiveAt: last, devices: sessions.filter((row) => !row.endedAt).length };
	}

	#signOut(userId: UserId) {
		this.#db.replace(
			'sessions',
			this.#db
				.table('sessions')
				.map((row) => (row.userId === userId && !row.endedAt ? { ...row, endedAt: new Date().toISOString() } : row)),
		);
	}

	/** Future Spitex visits of someone who leaves go back to the open visits, to be planned again. */
	#releaseVisits(tenantId: TenantId, userId: UserId) {
		const now = new Date().toISOString();
		this.#db.replace(
			'appointments',
			this.#db
				.table('appointments')
				.map((row) =>
					row.tenantId === tenantId && row.assigneeId === userId && row.kind === 'spitex' && row.start >= now
						? { ...row, assigneeId: null, revision: row.revision + 1, updatedAt: now }
						: row,
				),
		);
	}

	#memberLabel(userId: UserId) {
		const user = this.#db.table('users').find((row) => row.id === userId);
		return user ? `${user.firstName} ${user.lastName}` : '';
	}

	saveRole(role: { id: RoleId | null; name: string; permissions: Permission[] }): Promise<Role> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('roles.manage');
			const error = validationError(roleSchema, role, (key) => this.#localize(key));
			if (error) throw error;
			if (!role.id) {
				const created = this.#insertRole(tenantId, role.name.trim(), 'custom', role.permissions);
				this.#audit(tenantId, 'role.created', 'role', created.id, created.name);
				return created;
			}
			const current = this.#db.table('roles').find((row) => row.id === role.id && row.tenantId === tenantId);
			if (!current) throw new MockApiError('not_found', this.#localize('error.role_not_found'));
			if (current.kind !== 'custom') throw new MockApiError('validation', this.#localize('error.ws.protected_role'));
			const next = {
				...current,
				name: role.name.trim(),
				permissions: role.permissions,
				revision: current.revision + 1,
			};
			this.#db.replace(
				'roles',
				this.#db.table('roles').map((row) => (row.id === role.id ? next : row)),
			);
			this.#audit(tenantId, 'role.updated', 'role', next.id, next.name);
			return next;
		}, ['roles', 'audit']);
	}

	deleteRole(id: RoleId): Promise<void> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('roles.manage');
			const role = this.#db.table('roles').find((row) => row.id === id && row.tenantId === tenantId);
			if (!role) throw new MockApiError('not_found', this.#localize('error.role_not_found'));
			if (role.kind !== 'custom') throw new MockApiError('validation', this.#localize('error.ws.protected_role'));
			if (this.#db.table('memberships').some((row) => row.roleId === id && row.status === 'active')) {
				throw new MockApiError('validation', this.#localize('error.ws.role_in_use'));
			}
			this.#db.replace(
				'roles',
				this.#db.table('roles').filter((row) => row.id !== id),
			);
			this.#audit(tenantId, 'role.deleted', 'role', id, role.name);
		}, ['roles', 'audit']);
	}

	changePlan(plan: PlanCode, cycle: 'monthly' | 'yearly'): Promise<Tenant> {
		return this.#db.request(() => {
			const tenant = this.#mutateTenant('billing.manage', 'tenant.plan_changed', {
				plan,
				billingCycle: cycle,
				cancelledAt: null,
			});
			const allowed = planFor(plan).modules;
			return this.#mutateTenant('billing.manage', 'tenant.updated', {
				enabledModules: tenant.enabledModules.filter((module) => allowed.includes(module)),
			});
		}, ['tenants', 'audit']);
	}

	cancelSubscription(): Promise<Tenant> {
		return this.#db.request(
			() => this.#mutateTenant('billing.manage', 'tenant.cancelled', { cancelledAt: new Date().toISOString() }),
			['tenants', 'audit'],
		);
	}

	resumeSubscription(): Promise<Tenant> {
		return this.#db.request(
			() => this.#mutateTenant('billing.manage', 'tenant.resumed', { cancelledAt: null }),
			['tenants', 'audit'],
		);
	}

	updatePaymentMethod(card: { number: string; expires: string }): Promise<Tenant> {
		return this.#db.request(() => {
			const digits = card.number.replace(/\D/g, '');
			const fields: { [field: string]: string } = {};
			if (digits.length < 13 || digits.length > 19) fields.number = this.#localize('error.ws.invalid_card');
			if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expires)) fields.expires = this.#localize('error.ws.invalid_expiry');
			if (Object.keys(fields).length > 0)
				throw new MockApiError('validation', this.#localize('error.validation'), fields);
			const brand = digits.startsWith('4') ? 'Visa' : digits.startsWith('5') ? 'Mastercard' : 'Karte';
			return this.#mutateTenant('billing.manage', 'tenant.payment_method_changed', {
				paymentMethod: { brand, last4: digits.slice(-4), expires: card.expires },
			});
		}, ['tenants', 'audit']);
	}

	billingHistory(): Promise<PlatformInvoice[]> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('billing.manage');
			const tenant = this.#db.table('tenants').find((row) => row.id === tenantId)!;
			const seats = this.#db
				.table('memberships')
				.filter((row) => row.tenantId === tenantId && row.status === 'active').length;
			const amount = priceFor(planFor(tenant.plan), seats, 'monthly');
			return Array.from({ length: 6 }, (_, index) => {
				const date = new Date();
				date.setDate(1);
				date.setMonth(date.getMonth() - index);
				return {
					number: `CL-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${tenantId.slice(-4)}`,
					date: toCalendarDate(date),
					amount,
					status: index === 0 ? 'open' : 'paid',
				} as PlatformInvoice;
			});
		});
	}

	/** The tenant's own bucket, or null while documents stay in CLinks storage. The secret never comes back. */
	storageSettings(): Promise<StorageSettingsView | null> {
		return this.#db.request(() => {
			const row = this.#storageRow(this.#authorize('settings.manage'));
			return row ? storageView(row) : null;
		});
	}

	saveStorageSettings(input: StorageSettingsInput): Promise<StorageSettingsView | null> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('settings.manage');
			const tenant = this.#db.table('tenants').find((row) => row.id === tenantId)!;
			const current = this.#storageRow(tenantId);
			const others = this.#db.table('storageSettings').filter((row) => row.tenantId !== tenantId);
			if (input.provider === 'clinks') {
				this.#db.replace('storageSettings', others);
				this.#audit(tenantId, 'tenant.storage_changed', 'tenant', tenantId, tenant.name);
				return null;
			}
			// A stored secret belongs to one access key on one provider; anything else needs the secret again.
			const keepsSecret =
				current !== undefined &&
				current.provider === input.provider &&
				current.accessKeyId === input.accessKeyId.trim();
			const consent = needsLocationConsent(dataLocation(input.provider, input.endpoint), tenant.enabledModules);
			const error = validationError(
				storageSettingsSchema({ requireSecret: !keepsSecret, requireAcknowledgement: consent }),
				input,
				(key) => this.#localize(key),
			);
			if (error) throw error;
			const now = new Date().toISOString();
			const fields = {
				provider: input.provider,
				endpoint: input.endpoint.trim().replace(/\/$/, ''),
				region: input.region.trim(),
				bucket: input.bucket.trim(),
				accessKeyId: input.accessKeyId.trim(),
				secretAccessKey: input.secretAccessKey || current!.secretAccessKey,
				pathStyle: input.pathStyle,
				locationAcknowledgedAt: consent ? (current?.locationAcknowledgedAt ?? now) : null,
				lastCheck: null,
			};
			const next: StorageSettings = current
				? { ...current, ...fields, revision: current.revision + 1, updatedAt: now }
				: stamp<StorageSettings>({ id: newId(), tenantId, ...fields });
			this.#db.replace('storageSettings', [...others, next]);
			this.#audit(tenantId, 'tenant.storage_changed', 'tenant', tenantId, tenant.name);
			return storageView(next);
		}, ['storageSettings', 'audit']);
	}

	/**
	 * Checks that the stored bucket answers. The mock cannot reach a bucket, so it only checks that the settings
	 * are complete; the real API will put, read and delete a probe object.
	 */
	testStorageConnection(): Promise<StorageCheck> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('settings.manage');
			const current = this.#storageRow(tenantId);
			const check: StorageCheck = { at: new Date().toISOString(), ok: true };
			if (!current) return check;
			const next = { ...current, lastCheck: check, revision: current.revision + 1, updatedAt: check.at };
			this.#db.replace(
				'storageSettings',
				this.#db.table('storageSettings').map((row) => (row.id === current.id ? next : row)),
			);
			return check;
		}, ['storageSettings']);
	}

	exportTenantData(): Promise<{ [table: string]: unknown[] }> {
		return this.#db.request(() => {
			const tenantId = this.#authorize('settings.manage');
			const snapshot = this.#db.export();
			const result: { [table: string]: unknown[] } = {};
			for (const [name, rows] of Object.entries(snapshot)) {
				const owned = (rows as { tenantId?: string }[]).filter((row) => row.tenantId === tenantId);
				if (owned.length > 0) result[name] = owned;
			}
			result.tenant = snapshot.tenants.filter((row) => row.id === tenantId);
			// Access keys stay out of exports.
			if (result.storageSettings)
				result.storageSettings = (result.storageSettings as StorageSettings[]).map(storageView);
			return result;
		});
	}

	deleteAccount(password: string): Promise<void> {
		return this.#db.request(() => {
			const userId = this.#requireUser();
			const user = this.#db.table('users').find((row) => row.id === userId);
			if (!user || user.password !== password) {
				throw new MockApiError('validation', this.#localize('error.validation'), {
					password: this.#localize('error.ws.wrong_password'),
				});
			}
			for (const membership of this.#db
				.table('memberships')
				.filter((row) => row.userId === userId && row.status === 'active')) {
				const next = { ...membership, status: 'inactive' as const };
				this.#protectFinalAdministrator(membership.tenantId, membership, next);
			}
			this.#db.replace(
				'memberships',
				this.#db
					.table('memberships')
					.map((row) => (row.userId === userId ? { ...row, status: 'inactive' as const } : row)),
			);
			this.#db.replace(
				'users',
				this.#db.table('users').filter((row) => row.id !== userId),
			);
		}, ['users', 'memberships']);
	}

	platformTenants(): Promise<TenantOverview[]> {
		return this.#db.request(() => {
			this.#requireSuperAdministrator();
			return this.#db.table('tenants').map((tenant) => ({
				tenant,
				members: this.#db.table('memberships').filter((row) => row.tenantId === tenant.id && row.status === 'active')
					.length,
				contacts: this.#db.table('contacts').filter((row) => row.tenantId === tenant.id).length,
				invoices: this.#db.table('invoices').filter((row) => row.tenantId === tenant.id).length,
			}));
		});
	}

	platformMembers(tenantId: TenantId): Promise<Member[]> {
		return this.#db.request(() => {
			this.#requireSuperAdministrator();
			return this.#db
				.table('memberships')
				.filter((row) => row.tenantId === tenantId && row.status === 'active')
				.flatMap((membership) => {
					const user = this.#db.table('users').find((row) => row.id === membership.userId);
					const role = this.#db.table('roles').find((row) => row.id === membership.roleId);
					return user && role ? [{ membership, user, role, access: null }] : [];
				});
		});
	}

	setFeatureFlag(tenantId: TenantId, flag: string, enabled: boolean): Promise<Tenant> {
		return this.#db.request(() => {
			this.#requireSuperAdministrator();
			const tenant = this.#db.table('tenants').find((row) => row.id === tenantId);
			if (!tenant) throw new MockApiError('not_found', this.#localize('error.tenant_not_found'));
			const flags = new Set(tenant.featureFlags);
			if (enabled) flags.add(flag);
			else flags.delete(flag);
			const next = { ...tenant, featureFlags: [...flags], revision: tenant.revision + 1 };
			this.#db.replace(
				'tenants',
				this.#db.table('tenants').map((row) => (row.id === tenantId ? next : row)),
			);
			return next;
		}, ['tenants']);
	}

	#storageRow(tenantId: TenantId) {
		return this.#db.table('storageSettings').find((row) => row.tenantId === tenantId);
	}

	#localize(key: string) {
		return this.#caller.localize(key);
	}

	#requireUser(): UserId {
		const userId = this.#caller.userId();
		if (!userId) throw new MockApiError('unauthorized', this.#localize('error.unauthorized'));
		return userId;
	}

	#requireTenant(): TenantId {
		const tenantId = this.#caller.tenantId();
		if (!tenantId) throw new MockApiError('unauthorized', this.#localize('error.unauthorized'));
		return tenantId;
	}

	#requireSuperAdministrator() {
		const user = this.#db.table('users').find((row) => row.id === this.#caller.userId());
		if (user?.globalRole !== 'super_administrator')
			throw new MockApiError('unauthorized', this.#localize('error.unauthorized'));
	}

	#authorize(permission: Permission): TenantId {
		const tenantId = this.#requireTenant();
		if (!roleGrants(roleFor(this.#db, this.#caller.userId(), tenantId), permission)) {
			throw new MockApiError('unauthorized', this.#localize('error.unauthorized'));
		}
		return tenantId;
	}

	#patchUser(userId: UserId, changes: Partial<User>): User {
		const user = this.#db.table('users').find((row) => row.id === userId);
		if (!user) throw new MockApiError('not_found', this.#localize('error.user_not_found'));
		const next = { ...user, ...changes, id: user.id, revision: user.revision + 1, updatedAt: new Date().toISOString() };
		this.#db.replace(
			'users',
			this.#db.table('users').map((row) => (row.id === userId ? next : row)),
		);
		return next;
	}

	#mutateTenant(permission: Permission, action: string, changes: Partial<Tenant>): Tenant {
		const tenantId = this.#authorize(permission);
		const tenant = this.#db.table('tenants').find((row) => row.id === tenantId);
		if (!tenant) throw new MockApiError('not_found', this.#localize('error.tenant_not_found'));
		const next = {
			...tenant,
			...changes,
			id: tenant.id,
			revision: tenant.revision + 1,
			updatedAt: new Date().toISOString(),
		};
		this.#db.replace(
			'tenants',
			this.#db.table('tenants').map((row) => (row.id === tenantId ? next : row)),
		);
		this.#audit(tenantId, action, 'tenant', tenantId, next.name);
		return next;
	}

	#insertRole(tenantId: TenantId, name: string, kind: Role['kind'], permissions: readonly Permission[]): Role {
		const role = stamp<Role>({ id: newId(), tenantId, name, kind, permissions: [...permissions] });
		this.#db.table('roles').push(role);
		return role;
	}

	#insertInvitation(tenantId: TenantId, email: string, roleId: RoleId, invitedBy: UserId): Invitation {
		const invitation = stamp<Invitation>({
			id: newId(),
			tenantId,
			email,
			roleId,
			status: 'pending',
			invitedBy,
			expiresAt: new Date(`${addDays(toCalendarDate(new Date()), 7)}T23:59:59`).toISOString(),
		});
		this.#db.table('invitations').push(invitation);
		return invitation;
	}

	/** Mirrors the server rule: the last active administrator cannot be demoted or deactivated. */
	#protectFinalAdministrator(tenantId: TenantId, current: Membership, next: Membership) {
		const roles = this.#db.table('roles').filter((row) => row.tenantId === tenantId);
		const isAdministrator = (membership: Membership) =>
			membership.status === 'active' && roles.find((role) => role.id === membership.roleId)?.kind === 'administrator';
		if (!isAdministrator(current) || isAdministrator(next)) return;
		const others = this.#db
			.table('memberships')
			.filter((row) => row.tenantId === tenantId && row.id !== current.id && isAdministrator(row));
		if (others.length === 0) throw new MockApiError('validation', this.#localize('error.ws.last_administrator'));
	}

	#audit(
		tenantId: TenantId,
		action: string,
		kind: 'invitation' | 'membership' | 'role' | 'tenant',
		id: string,
		label: string,
		actor?: UserId,
	) {
		const actorId = actor ?? this.#caller.userId();
		if (actorId) appendAudit(this.#db, { tenantId, actorId, action, target: { kind, id, label } });
	}
}

function storageView({ secretAccessKey, ...rest }: StorageSettings): StorageSettingsView {
	return { ...rest, secretHint: secretAccessKey ? secretAccessKey.slice(-4) : null };
}
