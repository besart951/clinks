import type { AuthCapabilities, Permission, Session, SessionService } from '@clinks/api-client';
import { isUnauthenticatedError } from '@clinks/api-client/errors';
import { allowsAccess, hasPermission, isTenantAdministrator, type AccessPolicy } from './access.ts';
import { isSafeInternalPath, returnToFromSearch } from './navigation.ts';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
export type Navigate = (target: string) => void | Promise<void>;
export type ExternalRedirect = (target: string) => void;

const sessionStaleAfterMs = 5 * 60 * 1000;

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

export interface GoogleAuthentication {
	mode: 'login' | 'invite';
	returnTo: string;
	invitationToken?: string;
}

export class AuthStore {
	current = $state.raw<Session | null>(null);
	capabilities = $state.raw<AuthCapabilities>({ googleOIDCEnabled: false });
	capabilitiesLoaded = $state(false);
	status = $state<AuthStatus>('loading');
	refreshing = $state(false);
	error = $state.raw<unknown>(null);

	#service: SessionService;
	#navigate: Navigate;
	#externalRedirect: ExternalRedirect;
	#loading: Promise<void> | null = null;
	#initialized = false;
	#capabilitiesAvailable = false;
	#lastValidatedAt = 0;
	#request = 0;

	constructor(service: SessionService, navigate: Navigate, externalRedirect: ExternalRedirect = browserRedirect) {
		this.#service = service;
		this.#navigate = navigate;
		this.#externalRedirect = externalRedirect;
	}

	initialize(): Promise<void> {
		if (this.#loading) return this.#loading;
		if (this.#initialized) return Promise.resolve();
		this.#initialized = true;
		this.#loading = Promise.all([this.#load(true), this.#loadCapabilities()])
			.then(() => undefined)
			.finally(() => {
				this.#loading = null;
			});
		return this.#loading;
	}

	async refresh() {
		if (this.#loading) return this.#loading;
		const capabilities = this.#capabilitiesAvailable ? Promise.resolve() : this.#loadCapabilities();
		this.#loading = Promise.all([this.#load(this.current === null), capabilities])
			.then(() => undefined)
			.finally(() => {
				this.#loading = null;
			});
		return this.#loading;
	}

	async revalidateIfStale(now = Date.now()) {
		if (now - this.#lastValidatedAt < sessionStaleAfterMs) return;
		await this.refresh();
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
			this.#rejectAction(request, error);
			throw error;
		}
	}

	startGoogle(authentication: GoogleAuthentication) {
		if (!this.capabilities.googleOIDCEnabled) return;
		if (!isSafeInternalPath(authentication.returnTo) || typeof location === 'undefined') return;
		const returnTo = new URL(authentication.returnTo, location.origin).toString();
		this.#externalRedirect(
			this.#service.googleOIDCStartURL(authentication.mode, returnTo, authentication.invitationToken),
		);
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
		this.#lastValidatedAt = Date.now();
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

	async #load(showLoading: boolean) {
		const request = ++this.#request;
		this.error = null;
		if (showLoading) this.status = 'loading';
		else this.refreshing = true;
		try {
			const session = await this.#service.getSession();
			this.#accept(request, session);
		} catch (error) {
			this.#rejectLoad(request, error, !showLoading);
		} finally {
			if (request === this.#request) this.refreshing = false;
		}
	}

	async #loadCapabilities() {
		try {
			this.capabilities = await this.#service.authCapabilities();
			this.#capabilitiesAvailable = true;
		} catch {
			this.capabilities = { googleOIDCEnabled: false };
			this.#capabilitiesAvailable = false;
		} finally {
			this.capabilitiesLoaded = true;
		}
	}

	async #updateSession(action: () => Promise<Session>) {
		const request = ++this.#request;
		this.error = null;
		try {
			this.#accept(request, await action());
		} catch (error) {
			this.#rejectAction(request, error);
			throw error;
		}
	}

	#accept(request: number, session: Session) {
		if (request !== this.#request) return;
		this.current = session;
		this.error = null;
		this.status = 'authenticated';
		this.#lastValidatedAt = Date.now();
	}

	#rejectLoad(request: number, error: unknown, preserveCurrent: boolean) {
		if (request !== this.#request) return;
		this.#lastValidatedAt = Date.now();
		if (isUnauthenticatedError(error)) {
			this.current = null;
			this.error = null;
			this.status = 'anonymous';
			return;
		}
		this.error = error;
		this.status = preserveCurrent && this.current ? 'authenticated' : 'error';
	}

	#rejectAction(request: number, error: unknown) {
		if (request !== this.#request) return;
		if (isUnauthenticatedError(error)) {
			this.invalidate();
			return;
		}
		this.error = error;
		this.status = this.current ? 'authenticated' : 'anonymous';
	}
}

function browserRedirect(target: string) {
	if (typeof location !== 'undefined') location.assign(target);
}
