import { Code, ConnectError, createClient as createConnectClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import {
	productDefaultLocale,
	type Language,
	type Locale,
	type LocalizedError,
	type TranslationResponse,
} from '@clinks/i18n-types';
import type {
	AuditEvent as AuditEventMessage,
	Invitation as InvitationMessage,
	Membership as MembershipMessage,
	Role as RoleMessage,
	Session as SessionMessage,
	SystemStats as SystemStatsMessage,
	UserDetail as UserDetailMessage,
	UserSummary as UserSummaryMessage,
} from './gen/clinks/v1/clinks_pb.ts';
import { APIError } from './errors.ts';
import {
	ClinksService,
	AuditSort as ProtoAuditSort,
	GlobalRole as ProtoGlobalRole,
	InvitationStatus as ProtoInvitationStatus,
	InvitationSort as ProtoInvitationSort,
	LanguageSort as ProtoLanguageSort,
	MembershipStatus as ProtoMembershipStatus,
	MembershipSort as ProtoMembershipSort,
	RoleKind as ProtoRoleKind,
	RoleSort as ProtoRoleSort,
	SortDirection as ProtoSortDirection,
	TenantSort as ProtoTenantSort,
	TranslationSort as ProtoTranslationSort,
	UserSort as ProtoUserSort,
} from './gen/clinks/v1/clinks_pb.ts';

export type { Language, Locale, LocalizedError, TranslationResponse };
export { productDefaultLocale };
export { APIError, isUnauthenticatedError } from './errors.ts';

export type ApplicationScope = 'admin' | 'planer_link' | 'infra_link';
export type GlobalRole = 'user' | 'super_administrator';
export type RoleKind = 'administrator' | 'user' | 'custom';
export type MembershipStatus = 'active' | 'inactive';
export type InvitationStatus = 'pending' | 'used' | 'expired' | 'revoked';
export type SortDirection = 'ascending' | 'descending';
export type TenantSort = 'name' | 'created_at';
export type UserSort = 'email' | 'created_at';
export type InvitationSort = 'created_at' | 'email' | 'expires_at';
export type LanguageSort = 'name' | 'code';
export type TranslationSort = 'key' | 'updated_at';
export type AuditSort = 'occurred_at';
export type MembershipSort = 'email' | 'created_at';
export type RoleSort = 'name' | 'created_at';

export const permissions = [
	'tenant.read',
	'tenant.manage',
	'user.read',
	'user.manage',
	'project.read',
	'project.create',
	'project.edit',
	'project.delete',
	'role.read',
	'role.manage',
] as const;

export type Permission = (typeof permissions)[number];

const permissionSet = new Set<string>(permissions);

export function isPermission(value: string): value is Permission {
	return permissionSet.has(value);
}

export interface User {
	id: string;
	email: string;
	locale: Locale;
	globalRole: GlobalRole;
}

export interface Tenant {
	id: string;
	name: string;
	revision: bigint;
}

export interface RoleSummary {
	id: string;
	name: string;
	kind: RoleKind;
	permissions: Permission[];
	revision: bigint;
}

export interface Role extends RoleSummary {
	tenantId: string;
	createdAt: string;
	updatedAt: string;
}

export interface Membership {
	id: string;
	userId: string;
	userEmail: string;
	tenant: Tenant;
	role: RoleSummary;
	status: MembershipStatus;
	revision: bigint;
}

export interface Session {
	user: User;
	activeTenant?: Tenant;
	memberships: Membership[];
}

export interface AuthCapabilities {
	googleOIDCEnabled: boolean;
}

export interface ManagedLanguage extends Language {
	revision: bigint;
}

export interface Invitation {
	id: string;
	tenantId: string;
	email: string;
	role: RoleSummary;
	status: InvitationStatus;
	expiresAt: string;
	usedAt?: string;
	revokedAt?: string;
	acceptanceUrl: string;
	deliveryStatus: 'sent' | 'failed' | 'not_configured';
}

export interface TranslationInput {
	locale: Locale;
	applicationScope: 'shared' | ApplicationScope;
	key: string;
	value: string;
	revision?: bigint;
}

export interface TranslationOverride extends Required<TranslationInput> {}

export interface AuditEvent {
	id: string;
	occurredAt: string;
	actorId: string;
	actorEmail: string;
	tenantId: string;
	tenantName: string;
	action: string;
	target: string;
	description: string;
}

export interface AuditFilter {
	from?: string;
	to?: string;
	actorId?: string;
	tenantId?: string;
	action?: string;
	search?: string;
	sort?: AuditSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface AuditPage {
	events: AuditEvent[];
	nextCursor: string;
}

export interface UserSummary {
	id: string;
	email: string;
	locale: Locale;
	globalRole: GlobalRole;
	membershipCount: number;
}

export interface UserDetail {
	user: UserSummary;
	memberships: Membership[];
}

export interface UserFilter {
	search?: string;
	role?: string;
	sort?: UserSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface UserPage {
	users: UserSummary[];
	nextCursor: string;
}

export interface InvitationFilter {
	tenantId?: string;
	status?: string;
	search?: string;
	sort?: InvitationSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface TenantFilter {
	search?: string;
	sort?: TenantSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface TenantPage {
	tenants: Tenant[];
	nextCursor: string;
}

export interface LanguageFilter {
	search?: string;
	active?: boolean;
	sort?: LanguageSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface LanguagePage {
	languages: ManagedLanguage[];
	nextCursor: string;
}

export interface TranslationFilter {
	search?: string;
	locale?: Locale;
	applicationScope?: 'shared' | ApplicationScope;
	sort?: TranslationSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface TranslationPage {
	overrides: TranslationOverride[];
	nextCursor: string;
}

export interface MembershipFilter {
	search?: string;
	roleId?: string;
	status?: MembershipStatus;
	sort?: MembershipSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface MembershipPage {
	memberships: Membership[];
	nextCursor: string;
}

export interface RoleFilter {
	search?: string;
	kind?: RoleKind;
	sort?: RoleSort;
	direction?: SortDirection;
	cursor?: string;
	pageSize?: number;
}

export interface RolePage {
	roles: Role[];
	nextCursor: string;
}

export interface InvitationPage {
	invitations: Invitation[];
	nextCursor: string;
}

export interface SystemStats {
	userCount: number;
	tenantCount: number;
	pendingInvitationCount: number;
	activeLanguageCount: number;
}

export interface ClientOptions {
	baseURL: string;
	locale: () => Locale;
	applicationScope: () => ApplicationScope;
}

export function createClient(options: ClientOptions) {
	let unauthenticatedHandler: (() => void) | undefined;
	const transport = createConnectTransport({
		baseUrl: options.baseURL,
		fetch: (input, init) => {
			const headers = new Headers(init?.headers);
			headers.set('Accept-Language', options.locale());
			return globalThis.fetch(input, { ...init, headers, credentials: 'include' });
		},
	});
	const rpc = createConnectClient(ClinksService, transport);
	const invoke = <T>(action: () => Promise<T>) => call(options, action, () => unauthenticatedHandler?.());

	return {
		setUnauthenticatedHandler(handler?: () => void) {
			unauthenticatedHandler = handler;
		},
		login: (email: string, password: string) => invoke(() => rpc.login({ email, password }).then(session)),
		authCapabilities: () =>
			invoke(() => rpc.getAuthCapabilities({}).then((response) => ({ googleOIDCEnabled: response.googleOidcEnabled }))),
		googleOIDCStartURL: (mode: 'login' | 'invite', returnTo: string, invitationToken?: string) => {
			const target = new URL('/auth/oidc/google/start', options.baseURL);
			target.searchParams.set('mode', mode);
			target.searchParams.set('return_to', returnTo);
			if (mode === 'invite' && invitationToken) target.searchParams.set('token', invitationToken);
			return target.toString();
		},
		adminLogin: (email: string, password: string) =>
			invoke(() => rpc.loginSuperAdmin({ email, password }).then(session)),
		register: (email: string, password: string, tenantName: string) =>
			invoke(() => rpc.register({ email, password, tenantName, locale: options.locale() }).then(session)),
		logout: () => invoke(() => rpc.logout({}).then(() => undefined)),
		getSession: () => invoke(() => rpc.getSession({}).then(session)),
		switchTenant: (tenantId: string) => invoke(() => rpc.switchTenant({ tenantId }).then(session)),
		createInvitation: (email: string, roleId: string) =>
			invoke(() => rpc.createInvitation({ email, roleId }).then(invitation)),
		acceptInvitation: (token: string, email: string, password: string) =>
			invoke(() => rpc.acceptInvitation({ token, email, password, locale: options.locale() }).then(session)),
		roles: () => invoke(() => rpc.listRoles({ pageSize: 100 }).then((response) => response.roles.map(role))),
		languages: () => invoke(() => rpc.getLanguages({}).then((response) => response.languages.map(language))),
		translations: () =>
			invoke(() => rpc.getTranslations({ applicationScope: options.applicationScope() }).then(translations)),
		tenants: (filter: TenantFilter = {}) =>
			invoke(() =>
				rpc
					.listTenants({
						search: filter.search,
						sort: protoTenantSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then((response) => ({ tenants: response.tenants.map(tenant), nextCursor: response.nextCursor })),
			),
		createTenant: (name: string) => invoke(() => rpc.createTenant({ name }).then(tenant)),
		updateTenant: (value: Pick<Tenant, 'id' | 'name' | 'revision'>) =>
			invoke(() => rpc.updateTenant({ tenantId: value.id, name: value.name, revision: value.revision }).then(tenant)),
		adminLanguages: (filter: LanguageFilter = {}) =>
			invoke(() =>
				rpc
					.listManagedLanguages({
						search: filter.search,
						active: filter.active,
						sort: protoLanguageSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then((response) => ({
						languages: response.languages.map(managedLanguage),
						nextCursor: response.nextCursor,
					})),
			),
		createLanguage: (value: Pick<ManagedLanguage, 'code' | 'name' | 'isActive'>) =>
			invoke(() =>
				rpc.createLanguage({ code: value.code, name: value.name, isActive: value.isActive }).then(managedLanguage),
			),
		updateLanguage: (value: Pick<ManagedLanguage, 'code' | 'name' | 'isActive' | 'revision'>) =>
			invoke(() => rpc.updateLanguage(value).then(managedLanguage)),
		translationOverrides: (filter: TranslationFilter = {}) =>
			invoke(() =>
				rpc
					.listTranslationOverrides({
						search: filter.search,
						locale: filter.locale,
						applicationScope: filter.applicationScope,
						sort: protoTranslationSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then((response) => ({
						overrides: response.overrides.map(translationOverride),
						nextCursor: response.nextCursor,
					})),
			),
		saveTranslation: (value: TranslationInput) =>
			invoke(() =>
				rpc
					.upsertTranslationOverride({ override: { ...value, revision: value.revision ?? 0n } })
					.then(translationOverride),
			),
		deleteTranslation: (value: Pick<TranslationOverride, 'locale' | 'applicationScope' | 'key' | 'revision'>) =>
			invoke(() => rpc.deleteTranslationOverride(value).then(() => undefined)),
		auditEvents: (filter: AuditFilter) =>
			invoke(() =>
				rpc
					.listAuditEvents({
						...filter,
						sort: protoAuditSort(filter.sort),
						direction: protoSortDirection(filter.direction),
					})
					.then(auditPage),
			),
		listUsers: (filter: UserFilter) =>
			invoke(() =>
				rpc
					.listUsers({
						search: filter.search,
						globalRole: protoGlobalRoleFilter(filter.role),
						sort: protoUserSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then(userPage),
			),
		getUser: (userId: string) => invoke(() => rpc.getUser({ userId }).then(userDetail)),
		listInvitations: (filter: InvitationFilter) =>
			invoke(() =>
				rpc
					.listInvitations({
						tenantId: filter.tenantId,
						status: protoInvitationStatusFilter(filter.status),
						search: filter.search,
						sort: protoInvitationSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then(invitationPage),
			),
		revokeInvitation: (invitationId: string) =>
			invoke(() => rpc.revokeInvitation({ invitationId }).then(() => undefined)),
		listTenantInvitations: (filter: InvitationFilter = {}) =>
			invoke(() =>
				rpc
					.listTenantInvitations({
						status: protoInvitationStatusFilter(filter.status),
						search: filter.search,
						sort: protoInvitationSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then(invitationPage),
			),
		revokeTenantInvitation: (invitationId: string) =>
			invoke(() => rpc.revokeTenantInvitation({ invitationId }).then(() => undefined)),
		updateCurrentTenant: (value: Pick<Tenant, 'name' | 'revision'>) =>
			invoke(() => rpc.updateCurrentTenant(value).then(tenant)),
		listMemberships: (filter: MembershipFilter = {}) =>
			invoke(() =>
				rpc
					.listMemberships({
						search: filter.search,
						roleId: filter.roleId,
						status: protoMembershipStatus(filter.status),
						sort: protoMembershipSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then((response) => ({
						memberships: response.memberships.flatMap((value) => {
							const parsed = membership(value);
							return parsed ? [parsed] : [];
						}),
						nextCursor: response.nextCursor,
					})),
			),
		updateMembership: (value: Pick<Membership, 'id' | 'status' | 'revision'> & { roleId: string }) =>
			invoke(() =>
				rpc
					.updateMembership({
						membershipId: value.id,
						roleId: value.roleId,
						status: protoMembershipStatus(value.status),
						revision: value.revision,
					})
					.then((response) => {
						const parsed = membership(response);
						if (!parsed) throw invalidResponse('membership tenant or role missing');
						return parsed;
					}),
			),
		listRoles: (filter: RoleFilter = {}) =>
			invoke(() =>
				rpc
					.listRoles({
						search: filter.search,
						kind: protoRoleKind(filter.kind),
						sort: protoRoleSort(filter.sort),
						direction: protoSortDirection(filter.direction),
						cursor: filter.cursor,
						pageSize: filter.pageSize,
					})
					.then((response) => ({ roles: response.roles.map(role), nextCursor: response.nextCursor })),
			),
		createRole: (name: string, rolePermissions: Permission[]) =>
			invoke(() => rpc.createRole({ name, permissions: rolePermissions }).then(role)),
		updateRole: (value: Pick<Role, 'id' | 'name' | 'permissions' | 'revision'>) =>
			invoke(() =>
				rpc
					.updateRole({
						roleId: value.id,
						name: value.name,
						permissions: value.permissions,
						revision: value.revision,
					})
					.then(role),
			),
		deleteRole: (roleId: string, revision: bigint) =>
			invoke(() => rpc.deleteRole({ roleId, revision }).then(() => undefined)),
		systemStats: () => invoke(() => rpc.getSystemStats({}).then(systemStats)),
	};
}

export type ClinksClient = ReturnType<typeof createClient>;

export type {
	AuditService,
	InvitationService,
	LocalizationAdminService,
	SessionService,
	SystemService,
	TenantAccessService,
	TenantService,
	UserAdminService,
} from './services.js';

async function call<T>(options: ClientOptions, action: () => Promise<T>, onUnauthenticated: () => void): Promise<T> {
	try {
		return await action();
	} catch (error) {
		if (error instanceof ConnectError) {
			if (error.code === Code.Unauthenticated) onUnauthenticated();
			throw new APIError(
				{
					code: error.code.toString(),
					message: error.rawMessage,
					locale: error.metadata.get('Clinks-Locale') ?? options.locale(),
				},
				error.code,
			);
		}
		throw error;
	}
}

function session(value: SessionMessage): Session {
	if (!value.user) throw invalidResponse('session user missing');
	return {
		user: {
			id: value.user.id,
			email: value.user.email,
			locale: value.user.locale || productDefaultLocale,
			globalRole: globalRole(value.user.globalRole),
		},
		activeTenant: value.activeTenant ? tenant(value.activeTenant) : undefined,
		memberships: value.memberships.flatMap((value) => {
			const parsed = membership(value);
			return parsed ? [parsed] : [];
		}),
	};
}

function tenant(value: { id: string; name: string; revision: bigint }): Tenant {
	return { id: value.id, name: value.name, revision: value.revision };
}

function roleSummary(value: {
	id: string;
	name: string;
	kind: ProtoRoleKind;
	permissions: string[];
	revision: bigint;
}): RoleSummary {
	return {
		id: value.id,
		name: value.name,
		kind: roleKind(value.kind),
		permissions: value.permissions.filter(isPermission),
		revision: value.revision,
	};
}

function role(value: RoleMessage): Role {
	return {
		...roleSummary(value),
		tenantId: value.tenantId,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
	};
}

function membership(value: MembershipMessage): Membership | undefined {
	if (!value.tenant || !value.role) return undefined;
	return {
		id: value.id,
		userId: value.userId,
		userEmail: value.userEmail,
		tenant: tenant(value.tenant),
		role: roleSummary(value.role),
		status: membershipStatus(value.status),
		revision: value.revision,
	};
}

function invitation(value: InvitationMessage): Invitation {
	if (!value.role) throw invalidResponse('invitation role missing');
	return {
		id: value.id,
		tenantId: value.tenantId,
		email: value.email,
		role: roleSummary(value.role),
		status: invitationStatus(value.status),
		expiresAt: value.expiresAt,
		usedAt: value.usedAt || undefined,
		revokedAt: value.revokedAt || undefined,
		acceptanceUrl: value.acceptanceUrl,
		deliveryStatus: deliveryStatus(value.deliveryStatus),
	};
}

function language(value: { code: string; name: string; isDefault: boolean; isActive: boolean }): Language {
	return { code: value.code, name: value.name, isDefault: value.isDefault, isActive: value.isActive };
}

function managedLanguage(value: {
	code: string;
	name: string;
	isDefault: boolean;
	isActive: boolean;
	revision: bigint;
}): ManagedLanguage {
	return { ...language(value), revision: value.revision };
}

function translationOverride(value: {
	locale: string;
	applicationScope: string;
	key: string;
	value: string;
	revision: bigint;
}): TranslationOverride {
	return {
		locale: value.locale,
		applicationScope: translationScope(value.applicationScope),
		key: value.key,
		value: value.value,
		revision: value.revision,
	};
}

function translations(value: { locale: string; translations: { key: string; value: string }[] }): TranslationResponse {
	return {
		locale: value.locale,
		translations: Object.fromEntries(value.translations.map((translation) => [translation.key, translation.value])),
	};
}

function auditPage(value: { events: AuditEventMessage[]; nextCursor: string }): AuditPage {
	return { events: value.events.map(auditEvent), nextCursor: value.nextCursor };
}

function auditEvent(value: AuditEventMessage): AuditEvent {
	return {
		id: value.id,
		occurredAt: value.occurredAt,
		actorId: value.actorId,
		actorEmail: value.actorEmail,
		tenantId: value.tenantId,
		tenantName: value.tenantName,
		action: value.action,
		target: value.target,
		description: value.description,
	};
}

function userSummary(value: UserSummaryMessage): UserSummary {
	return {
		id: value.id,
		email: value.email,
		locale: value.locale || productDefaultLocale,
		globalRole: globalRole(value.globalRole),
		membershipCount: value.membershipCount,
	};
}

function userPage(value: { users: UserSummaryMessage[]; nextCursor: string }): UserPage {
	return { users: value.users.map(userSummary), nextCursor: value.nextCursor };
}

function userDetail(value: UserDetailMessage): UserDetail {
	if (!value.user) throw invalidResponse('user detail missing');
	return {
		user: userSummary(value.user),
		memberships: value.memberships.flatMap((value) => {
			const parsed = membership(value);
			return parsed ? [parsed] : [];
		}),
	};
}

function invitationPage(value: { invitations: InvitationMessage[]; nextCursor: string }): InvitationPage {
	return { invitations: value.invitations.map(invitation), nextCursor: value.nextCursor };
}

function systemStats(value: SystemStatsMessage): SystemStats {
	return {
		userCount: value.userCount,
		tenantCount: value.tenantCount,
		pendingInvitationCount: value.pendingInvitationCount,
		activeLanguageCount: value.activeLanguageCount,
	};
}

function globalRole(value: ProtoGlobalRole): GlobalRole {
	return value === ProtoGlobalRole.SUPER_ADMINISTRATOR ? 'super_administrator' : 'user';
}

function roleKind(value: ProtoRoleKind): RoleKind {
	switch (value) {
		case ProtoRoleKind.ADMINISTRATOR:
			return 'administrator';
		case ProtoRoleKind.CUSTOM:
			return 'custom';
		default:
			return 'user';
	}
}

function membershipStatus(value: ProtoMembershipStatus): MembershipStatus {
	return value === ProtoMembershipStatus.ACTIVE ? 'active' : 'inactive';
}

function invitationStatus(value: ProtoInvitationStatus): InvitationStatus {
	switch (value) {
		case ProtoInvitationStatus.USED:
			return 'used';
		case ProtoInvitationStatus.EXPIRED:
			return 'expired';
		case ProtoInvitationStatus.REVOKED:
			return 'revoked';
		default:
			return 'pending';
	}
}

function deliveryStatus(value: string): Invitation['deliveryStatus'] {
	return value === 'sent' || value === 'failed' ? value : 'not_configured';
}

function protoGlobalRoleFilter(value?: string): ProtoGlobalRole {
	if (value === 'super_administrator') return ProtoGlobalRole.SUPER_ADMINISTRATOR;
	if (value === 'user') return ProtoGlobalRole.USER;
	return ProtoGlobalRole.UNSPECIFIED;
}

function protoInvitationStatusFilter(value?: string): ProtoInvitationStatus {
	switch (value) {
		case 'pending':
			return ProtoInvitationStatus.PENDING;
		case 'used':
			return ProtoInvitationStatus.USED;
		case 'expired':
			return ProtoInvitationStatus.EXPIRED;
		case 'revoked':
			return ProtoInvitationStatus.REVOKED;
		default:
			return ProtoInvitationStatus.UNSPECIFIED;
	}
}

function protoSortDirection(value?: SortDirection): ProtoSortDirection {
	if (value === 'ascending') return ProtoSortDirection.ASCENDING;
	if (value === 'descending') return ProtoSortDirection.DESCENDING;
	return ProtoSortDirection.UNSPECIFIED;
}

function protoTenantSort(value?: TenantSort): ProtoTenantSort {
	if (value === 'name') return ProtoTenantSort.NAME;
	if (value === 'created_at') return ProtoTenantSort.CREATED_AT;
	return ProtoTenantSort.UNSPECIFIED;
}

function protoUserSort(value?: UserSort): ProtoUserSort {
	if (value === 'email') return ProtoUserSort.EMAIL;
	if (value === 'created_at') return ProtoUserSort.CREATED_AT;
	return ProtoUserSort.UNSPECIFIED;
}

function protoInvitationSort(value?: InvitationSort): ProtoInvitationSort {
	switch (value) {
		case 'email':
			return ProtoInvitationSort.EMAIL;
		case 'expires_at':
			return ProtoInvitationSort.EXPIRES_AT;
		default:
			return ProtoInvitationSort.UNSPECIFIED;
	}
}

function protoLanguageSort(value?: LanguageSort): ProtoLanguageSort {
	if (value === 'name') return ProtoLanguageSort.NAME;
	if (value === 'code') return ProtoLanguageSort.CODE;
	return ProtoLanguageSort.UNSPECIFIED;
}

function protoTranslationSort(value?: TranslationSort): ProtoTranslationSort {
	if (value === 'key') return ProtoTranslationSort.KEY;
	if (value === 'updated_at') return ProtoTranslationSort.UPDATED_AT;
	return ProtoTranslationSort.UNSPECIFIED;
}

function protoAuditSort(value?: AuditSort): ProtoAuditSort {
	return value === 'occurred_at' ? ProtoAuditSort.OCCURRED_AT : ProtoAuditSort.UNSPECIFIED;
}

function protoMembershipSort(value?: MembershipSort): ProtoMembershipSort {
	if (value === 'email') return ProtoMembershipSort.EMAIL;
	if (value === 'created_at') return ProtoMembershipSort.CREATED_AT;
	return ProtoMembershipSort.UNSPECIFIED;
}

function protoRoleSort(value?: RoleSort): ProtoRoleSort {
	if (value === 'name') return ProtoRoleSort.NAME;
	if (value === 'created_at') return ProtoRoleSort.CREATED_AT;
	return ProtoRoleSort.UNSPECIFIED;
}

function protoMembershipStatus(value?: MembershipStatus): ProtoMembershipStatus {
	if (value === 'active') return ProtoMembershipStatus.ACTIVE;
	if (value === 'inactive') return ProtoMembershipStatus.INACTIVE;
	return ProtoMembershipStatus.UNSPECIFIED;
}

function protoRoleKind(value?: RoleKind): ProtoRoleKind {
	switch (value) {
		case 'administrator':
			return ProtoRoleKind.ADMINISTRATOR;
		case 'user':
			return ProtoRoleKind.USER;
		case 'custom':
			return ProtoRoleKind.CUSTOM;
		default:
			return ProtoRoleKind.UNSPECIFIED;
	}
}

function translationScope(value: string): TranslationOverride['applicationScope'] {
	if (value === 'admin' || value === 'planer_link' || value === 'infra_link') return value;
	return 'shared';
}

function invalidResponse(detail: string): Error {
	return new Error(`Malformed response: ${detail}`);
}
