import type { SessionService } from '@clinks/api-client';
import type { Session } from '@clinks/api-client';

export class SessionStore {
	current = $state<Session | null>(null);

	#service: SessionService;

	constructor(service: SessionService) {
		this.#service = service;
	}

	async hydrate() {
		try {
			this.current = await this.#service.getSession();
		} catch {
			this.current = null;
		}
	}

	async login(email: string, password: string) {
		this.current = await this.#service.login(email, password);
	}

	async adminLogin(email: string, password: string) {
		this.current = await this.#service.adminLogin(email, password);
	}

	async register(email: string, password: string, tenantName: string) {
		this.current = await this.#service.register(email, password, tenantName);
	}

	async acceptInvitation(token: string, email: string, password: string) {
		this.current = await this.#service.acceptInvitation(token, email, password);
	}

	async switchTenant(tenantId: string) {
		this.current = await this.#service.switchTenant(tenantId);
	}

	async logout() {
		try {
			await this.#service.logout();
		} finally {
			this.current = null;
		}
	}

	get isAuthenticated() {
		return this.current != null;
	}

	get isSuperAdmin() {
		return this.current?.user.isSuperAdmin ?? false;
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
}
