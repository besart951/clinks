import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

/** Set by the database on insert, so optional when writing. */
type Defaulted<T> = ColumnType<T, T | undefined, T>;
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface TenantTable {
	id: string;
	name: string;
	industry: 'physio' | 'spitex' | 'services';
	brandColor: Defaulted<string>;
	locale: Defaulted<string>;
	timeZone: Defaulted<string>;
	plan: Defaulted<string>;
	billingCycle: Defaulted<'monthly' | 'yearly'>;
	trialEndsAt: Date | null;
	enabledModules: Defaulted<string[]>;
	featureFlags: Defaulted<string[]>;
	onboardingCompleted: Defaulted<boolean>;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface UserTable {
	id: string;
	email: string;
	firstName: Defaulted<string>;
	lastName: Defaulted<string>;
	avatarColor: Defaulted<string>;
	locale: Defaulted<string>;
	globalRole: 'super_administrator' | null;
	emailVerifiedAt: Date | null;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface RoleTable {
	id: string;
	tenantId: string;
	name: string;
	kind: 'administrator' | 'user' | 'custom';
	permissions: Defaulted<string[]>;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface MembershipTable {
	id: string;
	tenantId: string;
	userId: string;
	roleId: string;
	status: Defaulted<'active' | 'inactive'>;
	jobTitle: Defaulted<string>;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface InvitationTable {
	id: string;
	tenantId: string;
	email: string;
	roleId: string;
	status: Defaulted<'pending' | 'accepted' | 'revoked'>;
	expiresAt: Date;
	invitedBy: string;
	revision: Generated<number>;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

export interface AuditTable {
	id: string;
	tenantId: string | null;
	actorId: string | null;
	action: string;
	target: Defaulted<string>;
	meta: Defaulted<Record<string, unknown>>;
	ip: string | null;
	createdAt: Timestamp;
}

export interface CredentialTable {
	userId: string;
	passwordHash: string;
	totpSecret: Uint8Array | null;
	totpEnabledAt: Date | null;
	failedAttempts: Defaulted<number>;
	lockedUntil: Date | null;
	passwordChangedAt: Timestamp;
}

export interface RecoveryCodeTable {
	id: string;
	userId: string;
	codeHash: Uint8Array;
	usedAt: Date | null;
}

export type OneTimePurpose = 'verify_email' | 'reset_password' | 'invitation' | 'two_factor';

export interface OneTimeTokenTable {
	id: string;
	purpose: OneTimePurpose;
	userId: string | null;
	invitationId: string | null;
	tenantId: string | null;
	tokenHash: Uint8Array;
	attempts: Defaulted<number>;
	expiresAt: Date;
	usedAt: Date | null;
	createdAt: Timestamp;
}

export interface RefreshTokenTable {
	id: string;
	familyId: string;
	userId: string;
	tenantId: string | null;
	tokenHash: Uint8Array;
	device: Defaulted<string>;
	ip: string | null;
	expiresAt: Date;
	replacedAt: Date | null;
	revokedAt: Date | null;
	createdAt: Timestamp;
}

export interface Database {
	tenants: TenantTable;
	users: UserTable;
	roles: RoleTable;
	memberships: MembershipTable;
	invitations: InvitationTable;
	audit: AuditTable;
	'auth.credentials': CredentialTable;
	'auth.recoveryCodes': RecoveryCodeTable;
	'auth.oneTimeTokens': OneTimeTokenTable;
	'auth.refreshTokens': RefreshTokenTable;
}

export type TenantRow = Selectable<TenantTable>;
export type UserRow = Selectable<UserTable>;
export type RoleRow = Selectable<RoleTable>;
export type MembershipRow = Selectable<MembershipTable>;
export type InvitationRow = Selectable<InvitationTable>;
export type NewTenant = Insertable<TenantTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;
