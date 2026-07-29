import { ConnectError, createClient as createConnectClient } from '@connectrpc/connect';
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
	Session as SessionMessage,
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
	};
}

export type ClinksClient = ReturnType<typeof createClient>;

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
							role: value.role as Membership['role'],
							status: value.status as Membership['status'],
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
		role: value.role as Invitation['role'],
		expiresAt: value.expiresAt,
		acceptanceUrl: value.acceptanceUrl,
		deliveryStatus: value.deliveryStatus as Invitation['deliveryStatus'],
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
