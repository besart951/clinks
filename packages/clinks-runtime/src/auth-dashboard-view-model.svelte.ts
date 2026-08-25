import type { Invitation, InvitationService, Permission, Role, Session } from '@clinks/api-client';
import { BrowserClipboard } from './browser-clipboard.ts';
import type { ErrorMessageFormatter } from './error-handler.ts';

export interface AuthDashboardSession {
	readonly current: Session | null;
	switchTenant(tenantId: string): Promise<void>;
	hasPermission(permission: Permission, tenantId?: string): boolean;
	logout(): Promise<void>;
	navigate(target: string): Promise<void>;
}

export class AuthDashboardViewModel {
	#overrideSelectedTenant = $state<string | null>(null);
	invitationEmail = $state('');
	invitationRoleId = $state('');
	roles = $state.raw<Role[]>([]);
	createdInvitation = $state.raw<Invitation | null>(null);
	errorMessage = $state('');

	#client: Pick<InvitationService, 'createInvitation' | 'roles'>;
	#session: AuthDashboardSession;
	#messages: ErrorMessageFormatter;
	#clipboard: BrowserClipboard;
	#rolesRequest = 0;
	#rolesLoading: { tenantId: string; promise: Promise<void> } | null = null;

	constructor(
		client: Pick<InvitationService, 'createInvitation' | 'roles'>,
		session: AuthDashboardSession,
		messages: ErrorMessageFormatter,
		clipboard: BrowserClipboard,
	) {
		this.#client = client;
		this.#session = session;
		this.#messages = messages;
		this.#clipboard = clipboard;
	}

	get selectedTenant() {
		return this.#overrideSelectedTenant ?? this.#session.current?.activeTenant?.id ?? '';
	}

	set selectedTenant(value: string) {
		this.#overrideSelectedTenant = value;
	}

	async selectTenant(tenantID: string) {
		if (!tenantID || tenantID === this.#session.current?.activeTenant?.id) return;
		this.errorMessage = '';
		try {
			await this.#session.switchTenant(tenantID);
			this.#overrideSelectedTenant = null;
			await this.loadRoles();
		} catch (error) {
			this.errorMessage = this.#messages.message(error);
		}
	}

	async inviteMember() {
		if (!this.invitationRoleId) return;
		this.errorMessage = '';
		try {
			this.createdInvitation = await this.#client.createInvitation(this.invitationEmail, this.invitationRoleId);
			this.invitationEmail = '';
		} catch (error) {
			this.errorMessage = this.#messages.message(error);
		}
	}

	loadRoles(): Promise<void> {
		const activeTenantId = this.#session.current?.activeTenant?.id;
		const canManageInvitations =
			this.#session.hasPermission('user.manage', activeTenantId) &&
			this.#session.hasPermission('role.read', activeTenantId);
		if (!activeTenantId || !canManageInvitations) {
			this.#rolesRequest += 1;
			this.roles = [];
			this.invitationRoleId = '';
			return Promise.resolve();
		}
		if (this.#rolesLoading?.tenantId === activeTenantId) return this.#rolesLoading.promise;

		const request = ++this.#rolesRequest;
		const promise = this.#loadRoles(activeTenantId, request).finally(() => {
			if (request === this.#rolesRequest) this.#rolesLoading = null;
		});
		this.#rolesLoading = { tenantId: activeTenantId, promise };
		return promise;
	}

	async #loadRoles(activeTenantId: string, request: number) {
		try {
			const roles = await this.#client.roles();
			if (request !== this.#rolesRequest || this.#session.current?.activeTenant?.id !== activeTenantId) return;
			this.roles = roles;
			const defaultRole = roles.find((role) => role.kind === 'user') ?? roles[0];
			this.invitationRoleId = defaultRole?.id ?? '';
		} catch (error) {
			if (request !== this.#rolesRequest) return;
			this.roles = [];
			this.invitationRoleId = '';
			this.errorMessage = this.#messages.message(error);
		}
	}

	async copyInvitation() {
		if (!this.createdInvitation) return;
		try {
			await this.#clipboard.copy(this.createdInvitation.acceptanceUrl);
		} catch (error) {
			this.errorMessage = this.#messages.message(error);
		}
	}

	async signOut() {
		this.errorMessage = '';
		try {
			await this.#session.logout();
			await this.#session.navigate('/');
		} catch (error) {
			this.errorMessage = this.#messages.message(error);
		}
	}

	clear() {
		this.#rolesRequest += 1;
		this.#rolesLoading = null;
		this.#overrideSelectedTenant = null;
		this.invitationEmail = '';
		this.invitationRoleId = '';
		this.roles = [];
		this.createdInvitation = null;
		this.errorMessage = '';
	}
}
