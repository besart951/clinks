import type { Permission, Session, SessionService } from '@clinks/api-client';
import { isUnauthenticatedError } from '@clinks/api-client/errors';
import { allowsAccess, hasPermission, isTenantAdministrator, type AccessPolicy } from './access.ts';
import { returnToFromSearch } from './navigation.ts';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
export type Navigate = (target: string) => void | Promise<void>;

export interface Credentials {
	email: string;
	password: string;
}

export interface Registration extends Credentials {
	tenantName: string;
}

export interface InvitationAcceptance extends Credentials {
	token: string;
}

export class AuthStore {
	current = $state.raw<Session | null>(null);
	status = $state<AuthStatus>('loading');
	error = $state.raw<unknown>(null);

	#service: SessionService;
	#navigate: Navigate;
	#initialization: Promise<void> | null = null;
	#request = 0;

	constructor(service: SessionService, navigate: Navigate) {
		this.#service = service;
		this.#navigate = navigate;
	}

	initialize(): Promise<void> {
		if (this.status !== 'loading') return Promise.resolve();
		if (this.#initialization) return this.#initialization;
		this.#initialization = this.#load().finally(() => {
			this.#initialization = null;
		});
		return this.#initialization;
	}

	async refresh() {
		if (this.#initialization) return this.#initialization;
		await this.#load();
	}

	async login(credentials: Credentials) {
		await this.#updateSession(() => this.#service.login(credentials.email, credentials.password));
	}

	async loginSuperAdministrator(credentials: Credentials) {
		await this.#updateSession(() => this.#service.adminLogin(credentials.email, credentials.password));
	}

	async register(registration: Registration) {
		await this.#updateSession(() =>
			this.#service.register(registration.email, registration.password, registration.tenantName),
		);
	}

	async acceptInvitation(acceptance: InvitationAcceptance) {
		await this.#updateSession(() =>
			this.#service.acceptInvitation(acceptance.token, acceptance.email, acceptance.password),
		);
	}

	async switchTenant(tenantId: string) {
		await this.#updateSession(() => this.#service.switchTenant(tenantId));
	}

	async logout() {
		const request = ++this.#request;
		this.error = null;
		try {
			await this.#service.logout();
			if (request === this.#request) this.invalidate();
		} catch (error) {
			this.#reject(request, error);
			throw error;
		}
	}

	async continueAfterLogin(defaultTarget: string) {
		const search = typeof location === 'undefined' ? '' : location.search;
		await this.#navigate(returnToFromSearch(search, defaultTarget));
	}

	async navigate(target: string) {
		await this.#navigate(target);
	}

	invalidate() {
		this.#request += 1;
		this.current = null;
		this.error = null;
		this.status = 'anonymous';
	}

	allows(policy: AccessPolicy) {
		return this.status === 'authenticated' && allowsAccess(this.current, policy);
	}

	hasPermission(permission: Permission, tenantId?: string) {
		return this.status === 'authenticated' && hasPermission(this.current, permission, tenantId);
	}

	hasTenantAdministratorRole(tenantId?: string) {
		return this.status === 'authenticated' && isTenantAdministrator(this.current, tenantId);
	}

	get isAuthenticated() {
		return this.status === 'authenticated';
	}

	get isSuperAdministrator() {
		return this.current ? this.current.user.globalRole === 'super_administrator' : false;
	}

	get isTenantAdministrator() {
		return this.hasTenantAdministratorRole();
	}

	get email() {
		return this.current?.user.email ?? '';
	}

	get activeTenant() {
		return this.current?.activeTenant;
	}

	get memberships() {
		return this.current?.memberships ?? [];
	}

	async #load() {
		const request = ++this.#request;
		this.error = null;
		this.status = 'loading';
		try {
			const session = await this.#service.getSession();
			this.#accept(request, session);
		} catch (error) {
			this.#reject(request, error);
		}
	}

	async #updateSession(action: () => Promise<Session>) {
		const request = ++this.#request;
		this.error = null;
		try {
			this.#accept(request, await action());
		} catch (error) {
			this.#reject(request, error);
			throw error;
		}
	}

	#accept(request: number, session: Session) {
		if (request !== this.#request) return;
		this.current = session;
		this.error = null;
		this.status = 'authenticated';
	}

	#reject(request: number, error: unknown) {
		if (request !== this.#request) return;
		if (isUnauthenticatedError(error)) {
			this.current = null;
			this.error = null;
			this.status = 'anonymous';
			return;
		}
		this.error = error;
		this.status = 'error';
	}
}
