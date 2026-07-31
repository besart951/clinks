import type {
	AuditEvent,
	AuditFilter,
	AuditPage,
	Invitation,
	InvitationFilter,
	InvitationPage,
	Language,
	Locale,
	Session,
	SystemStats,
	Tenant,
	TranslationInput,
	UserDetail,
	UserFilter,
	UserPage,
} from './index.js';

/** Tenant management for super admins. */
export interface TenantService {
	tenants(): Promise<Tenant[]>;
	createTenant(name: string): Promise<Tenant>;
}

/** User management for super admins. */
export interface UserAdminService {
	listUsers(filter: UserFilter): Promise<UserPage>;
	getUser(userId: string): Promise<UserDetail>;
}

/** Invitation lifecycle — creation (tenant portal), listing + revocation (admin). */
export interface InvitationService {
	createInvitation(email: string, role: Invitation['role']): Promise<Invitation>;
	listInvitations(filter: InvitationFilter): Promise<InvitationPage>;
	revokeInvitation(invitationId: string): Promise<void>;
}

/** Localization management for super admins. */
export interface LocalizationAdminService {
	adminLanguages(): Promise<Language[]>;
	saveTranslation(value: TranslationInput): Promise<void>;
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
	getSession(): Promise<Session>;
	login(email: string, password: string): Promise<Session>;
	adminLogin(email: string, password: string): Promise<Session>;
	register(email: string, password: string, tenantName: string): Promise<Session>;
	acceptInvitation(token: string, email: string, password: string): Promise<Session>;
	switchTenant(tenantId: string): Promise<Session>;
	logout(): Promise<void>;
}
