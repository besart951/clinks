import type {
	AuditEvent,
	AuditFilter,
	AuditPage,
	AuthCapabilities,
	Invitation,
	InvitationFilter,
	InvitationPage,
	LanguageFilter,
	LanguagePage,
	Locale,
	ManagedLanguage,
	Membership,
	MembershipFilter,
	MembershipPage,
	Permission,
	Role,
	RoleFilter,
	RolePage,
	Session,
	SystemStats,
	Tenant,
	TenantFilter,
	TenantPage,
	TranslationFilter,
	TranslationInput,
	TranslationOverride,
	TranslationPage,
	UserDetail,
	UserFilter,
	UserPage,
} from './index.js';

/** Tenant management for super admins. */
export interface TenantService {
	tenants(filter?: TenantFilter): Promise<TenantPage>;
	createTenant(name: string): Promise<Tenant>;
	updateTenant(tenant: Pick<Tenant, 'id' | 'name' | 'revision'>): Promise<Tenant>;
}

/** User management for super admins. */
export interface UserAdminService {
	listUsers(filter: UserFilter): Promise<UserPage>;
	getUser(userId: string): Promise<UserDetail>;
}

/** Invitation lifecycle — creation (tenant portal), listing + revocation (admin). */
export interface InvitationService {
	createInvitation(email: string, roleId: string): Promise<Invitation>;
	roles(): Promise<Role[]>;
	listInvitations(filter: InvitationFilter): Promise<InvitationPage>;
	revokeInvitation(invitationId: string): Promise<void>;
	listTenantInvitations(filter: InvitationFilter): Promise<InvitationPage>;
	revokeTenantInvitation(invitationId: string): Promise<void>;
}

/** Localization management for super admins. */
export interface LocalizationAdminService {
	adminLanguages(filter?: LanguageFilter): Promise<LanguagePage>;
	createLanguage(language: Pick<ManagedLanguage, 'code' | 'name' | 'isActive'>): Promise<ManagedLanguage>;
	updateLanguage(language: Pick<ManagedLanguage, 'code' | 'name' | 'isActive' | 'revision'>): Promise<ManagedLanguage>;
	translationOverrides(filter?: TranslationFilter): Promise<TranslationPage>;
	saveTranslation(value: TranslationInput): Promise<TranslationOverride>;
	deleteTranslation(
		value: Pick<TranslationOverride, 'locale' | 'applicationScope' | 'key' | 'revision'>,
	): Promise<void>;
}

/** System overview for super admins. */
export interface SystemService {
	systemStats(): Promise<SystemStats>;
}

/** Audit log for super admins. */
export interface AuditService {
	auditEvents(filter: AuditFilter): Promise<AuditPage>;
}

/** Authentication and session management. */
export interface SessionService {
	authCapabilities(): Promise<AuthCapabilities>;
	googleOIDCStartURL(mode: 'login' | 'invite', returnTo: string, invitationToken?: string): string;
	getSession(): Promise<Session>;
	login(email: string, password: string): Promise<Session>;
	adminLogin(email: string, password: string): Promise<Session>;
	register(email: string, password: string, tenantName: string): Promise<Session>;
	acceptInvitation(token: string, email: string, password: string): Promise<Session>;
	switchTenant(tenantId: string): Promise<Session>;
	logout(): Promise<void>;
}

/** Tenant-owned administration through the active Session's RLS context. */
export interface TenantAccessService {
	updateCurrentTenant(tenant: Pick<Tenant, 'name' | 'revision'>): Promise<Tenant>;
	listMemberships(filter?: MembershipFilter): Promise<MembershipPage>;
	updateMembership(input: Pick<Membership, 'id' | 'status' | 'revision'> & { roleId: string }): Promise<Membership>;
	listRoles(filter?: RoleFilter): Promise<RolePage>;
	createRole(name: string, permissions: Permission[]): Promise<Role>;
	updateRole(role: Pick<Role, 'id' | 'name' | 'permissions' | 'revision'>): Promise<Role>;
	deleteRole(roleId: string, revision: bigint): Promise<void>;
}
