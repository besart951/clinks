import { ConnectError, createClient as createConnectClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import {
	productDefaultLocale,
	type Language,
	type Locale,
	type LocalizedError,
	type TranslationResponse,
} from '@clinks/i18n-types';

export type { Language, Locale, LocalizedError, TranslationResponse };
export { productDefaultLocale };

import type {
	AuditEvent as AuditEventMessage,
	Invitation as InvitationMessage,
	Session as SessionMessage,
	UserSummary as UserSummaryMessage,
	UserDetail as UserDetailMessage,
	SystemStats as SystemStatsMessage,
} from './gen/clinks/v1/clinks_pb.ts';
import { ClinksService } from './gen/clinks/v1/clinks_pb.ts';

export type ApplicationScope = 'admin' | 'planer_link' | 'infra_link';

export interface User {
	id: string;
	email: string;
	locale: Locale;
	isSuperAdmin: boolean;
}

export interface Tenant {
	id: string;
	name: string;
}

export interface Membership {
	id: string;
	tenant: Tenant;
	role: 'ROLE_TENANT_ADMIN' | 'ROLE_USER';
	status: 'ACTIVE';
}

export interface Session {
	user: User;
	activeTenant?: Tenant;
	memberships: Membership[];
}

export interface Invitation {
	id: string;
	tenantId: string;
	email: string;
	role: 'ROLE_TENANT_ADMIN' | 'ROLE_USER';
	expiresAt: string;
	usedAt?: string;
	acceptanceUrl: string;
	deliveryStatus: 'sent' | 'failed' | 'not_configured';
}

export interface TranslationInput {
	locale: Locale;
	applicationScope: 'shared' | ApplicationScope;
	key: string;
	value: string;
}

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
	isSuperAdmin: boolean;
	membershipCount: number;
}

export interface UserDetail {
	user: UserSummary;
	memberships: Membership[];
}

export interface UserFilter {
	search?: string;
	role?: string;
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
	cursor?: string;
	pageSize?: number;
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

export class APIError extends Error implements LocalizedError {
	code: string;
	locale: Locale;

	constructor(error: LocalizedError) {
		super(error.message);
		this.name = 'APIError';
		this.code = error.code;
		this.locale = error.locale;
	}
}

export interface ClientOptions {
	baseURL: string;
	locale: () => Locale;
	applicationScope: () => ApplicationScope;
}

export function createClient(options: ClientOptions) {
	const transport = createConnectTransport({
		baseUrl: options.baseURL,
		fetch: (input, init) => {
			const headers = new Headers(init?.headers);
			headers.set('Accept-Language', options.locale());
			return globalThis.fetch(input, { ...init, headers, credentials: 'include' });
		},
	});
	const rpc = createConnectClient(ClinksService, transport);

	return {
		login: (email: string, password: string) => call(options, () => rpc.login({ email, password }).then(session)),
		adminLogin: (email: string, password: string) =>
			call(options, () => rpc.loginSuperAdmin({ email, password }).then(session)),
		register: (email: string, password: string, tenantName: string) =>
			call(options, () => rpc.register({ email, password, tenantName }).then(session)),
		logout: () => call(options, () => rpc.logout({}).then(() => undefined)),
		getSession: () => call(options, () => rpc.getSession({}).then(session)),
		switchTenant: (tenantId: string) => call(options, () => rpc.switchTenant({ tenantId }).then(session)),
		createInvitation: (email: string, role: Invitation['role']) =>
			call(options, () => rpc.createInvitation({ email, role }).then(invitation)),
		acceptInvitation: (token: string, email: string, password: string) =>
			call(options, () => rpc.acceptInvitation({ token, email, password }).then(session)),
		languages: () => call(options, () => rpc.getLanguages({}).then((response) => response.languages)),
		translations: () =>
			call(options, () => rpc.getTranslations({ applicationScope: options.applicationScope() }).then(translations)),
		tenants: () => call(options, () => rpc.listTenants({}).then((response) => response.tenants.map(tenant))),
		createTenant: (name: string) => call(options, () => rpc.createTenant({ name }).then(tenant)),
		adminLanguages: () => call(options, () => rpc.listManagedLanguages({}).then((response) => response.languages)),
		saveLanguage: (value: Language) => call(options, () => rpc.saveLanguage(value).then(() => undefined)),
		saveTranslation: (value: TranslationInput) => call(options, () => rpc.saveTranslation(value).then(() => undefined)),
		auditEvents: (filter: AuditFilter) => call(options, () => rpc.listAuditEvents(filter).then(auditPage)),
		listUsers: (filter: UserFilter) => call(options, () => rpc.listUsers(filter).then(userPage)),
		getUser: (userId: string) => call(options, () => rpc.getUser({ userId }).then(userDetail)),
		listInvitations: (filter: InvitationFilter) =>
			call(options, () => rpc.listInvitations(filter).then(invitationPage)),
		revokeInvitation: (invitationId: string) =>
			call(options, () => rpc.revokeInvitation({ invitationId }).then(() => undefined)),
		systemStats: () => call(options, () => rpc.getSystemStats({}).then(systemStats)),
	};
}

export type ClinksClient = ReturnType<typeof createClient>;

export type {
	AuditService,
	InvitationService,
	LocalizationAdminService,
	SessionService,
	SystemService,
	TenantService,
	UserAdminService,
} from './services.js';

async function call<T>(options: ClientOptions, action: () => Promise<T>): Promise<T> {
	try {
		return await action();
	} catch (error) {
		if (error instanceof ConnectError) {
			throw new APIError({
				code: error.code.toString(),
				message: error.rawMessage,
				locale: error.metadata.get('Clinks-Locale') ?? options.locale(),
			});
		}
		throw error;
	}
}

function parseRole(role: string): Membership['role'] {
	return role === 'ROLE_TENANT_ADMIN' ? 'ROLE_TENANT_ADMIN' : 'ROLE_USER';
}

function parseDeliveryStatus(status: string): Invitation['deliveryStatus'] {
	if (status === 'sent' || status === 'failed' || status === 'not_configured') {
		return status;
	}
	return 'not_configured';
}

function session(value: SessionMessage): Session {
	return {
		user: {
			id: value.user?.id ?? '',
			email: value.user?.email ?? '',
			locale: value.user?.locale ?? productDefaultLocale,
			isSuperAdmin: value.user?.isSuperAdmin ?? false,
		},
		activeTenant: value.activeTenant ? tenant(value.activeTenant) : undefined,
		memberships: value.memberships.flatMap((value) =>
			value.tenant
				? [
						{
							id: value.id,
							tenant: tenant(value.tenant),
							role: parseRole(value.role),
							status: 'ACTIVE',
						},
					]
				: [],
		),
	};
}

function tenant(value: { id: string; name: string }): Tenant {
	return { id: value.id, name: value.name };
}

function invitation(value: InvitationMessage): Invitation {
	return {
		id: value.id,
		tenantId: value.tenantId,
		email: value.email,
		role: parseRole(value.role),
		expiresAt: value.expiresAt,
		acceptanceUrl: value.acceptanceUrl,
		deliveryStatus: parseDeliveryStatus(value.deliveryStatus),
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
		locale: value.locale ?? productDefaultLocale,
		isSuperAdmin: value.isSuperAdmin ?? false,
		membershipCount: value.membershipCount ?? 0,
	};
}

function userPage(value: { users: UserSummaryMessage[]; nextCursor: string }): UserPage {
	return { users: value.users.map(userSummary), nextCursor: value.nextCursor };
}

function userDetail(value: UserDetailMessage): UserDetail {
	if (!value.user) {
		throw new APIError({
			code: 'INVALID_RESPONSE',
			message: 'Malformed response: user detail missing',
			locale: productDefaultLocale,
		});
	}
	return {
		user: userSummary(value.user),
		memberships: value.memberships.flatMap((m) =>
			m.tenant
				? [
						{
							id: m.id,
							tenant: tenant(m.tenant),
							role: parseRole(m.role),
							status: 'ACTIVE',
						},
					]
				: [],
		),
	};
}

function invitationPage(value: { invitations: InvitationMessage[]; nextCursor: string }): InvitationPage {
	return { invitations: value.invitations.map(invitation), nextCursor: value.nextCursor };
}

function systemStats(value: SystemStatsMessage): SystemStats {
	return {
		userCount: value.userCount ?? 0,
		tenantCount: value.tenantCount ?? 0,
		pendingInvitationCount: value.pendingInvitationCount ?? 0,
		activeLanguageCount: value.activeLanguageCount ?? 0,
	};
}
