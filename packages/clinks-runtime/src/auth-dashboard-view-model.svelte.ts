import type { Invitation, InvitationService, Permission, Role, Session } from '@clinks/api-client';
import { BrowserClipboard } from './browser-clipboard.ts';
import type { ErrorMessageFormatter } from './auth-portal-view-model.svelte.ts';

export interface AuthDashboardSession {
	readonly current: Session | null;
	switchTenant(tenantId: string): Promise<void>;
	hasPermission(permission: Permission, tenantId?: string): boolean;
}

export class AuthDashboardViewModel {
	#overrideSelectedTenant = $state<string | null>(null);
	invitationEmail = $state('');
	invitationRoleId = $state('');
	roles = $state.raw<Role[]>([]);
	createdInvitation = $state.raw<Invitation | null>(null);

	#client: Pick<InvitationService, 'createInvitation' | 'roles'>;
	#session: AuthDashboardSession;
	#messages: ErrorMessageFormatter;
	#clipboard: BrowserClipboard;
	#onError: (message: string) => void;

	constructor(
		client: Pick<InvitationService, 'createInvitation' | 'roles'>,
		session: AuthDashboardSession,
		messages: ErrorMessageFormatter,
		clipboard: BrowserClipboard,
		onError: (message: string) => void,
	) {
		this.#client = client;
		this.#session = session;
		this.#messages = messages;
		this.#clipboard = clipboard;
		this.#onError = onError;
	}

	get selectedTenant() {
		return this.#overrideSelectedTenant ?? this.#session.current?.activeTenant?.id ?? '';
	}

	set selectedTenant(value: string) {
		this.#overrideSelectedTenant = value;
	}

	async selectTenant(tenantID: string) {
		if (!tenantID || tenantID === this.#session.current?.activeTenant?.id) return;
		this.#onError('');
		try {
			await this.#session.switchTenant(tenantID);
			this.#overrideSelectedTenant = null;
			await this.loadRoles();
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	async inviteMember() {
		if (!this.invitationRoleId) return;
		this.#onError('');
		try {
			this.createdInvitation = await this.#client.createInvitation(this.invitationEmail, this.invitationRoleId);
			this.invitationEmail = '';
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	async loadRoles() {
		const activeTenantId = this.#session.current?.activeTenant?.id;
		const canManageInvitations =
			this.#session.hasPermission('user.manage', activeTenantId) &&
			this.#session.hasPermission('role.read', activeTenantId);
		if (!activeTenantId || !canManageInvitations) {
			this.roles = [];
			this.invitationRoleId = '';
			return;
		}
		try {
			this.roles = await this.#client.roles();
			const defaultRole = this.roles.find((role) => role.kind === 'user') ?? this.roles[0];
			this.invitationRoleId = defaultRole?.id ?? '';
		} catch (error) {
			this.roles = [];
			this.invitationRoleId = '';
			this.#onError(this.#messages.message(error));
		}
	}

	async copyInvitation() {
		if (!this.createdInvitation) return;
		try {
			await this.#clipboard.copy(this.createdInvitation.acceptanceUrl);
		} catch (error) {
			this.#onError(this.#messages.message(error));
		}
	}

	clear() {
		this.#overrideSelectedTenant = null;
		this.invitationEmail = '';
		this.invitationRoleId = '';
		this.roles = [];
		this.createdInvitation = null;
	}
}
