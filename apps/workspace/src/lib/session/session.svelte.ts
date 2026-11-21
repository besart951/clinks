import type { TenantId, UserId } from '../domain/ids.ts';
import { moduleBooked, roleGrants } from '../domain/permissions.ts';
import type { Membership, ModuleKey, Permission, Role, Tenant, User } from '../domain/types.ts';
import type { AccountApi } from '../data/account-api.ts';

export type SessionStatus = 'loading' | 'anonymous' | 'two_factor' | 'verify_email' | 'authenticated';

interface StoredSession {
	userId: UserId;
	tenantId: TenantId | null;
	impersonatorId: UserId | null;
	verified: boolean;
}

const storageKey = 'clinks.workspace.session';

function readStored(): StoredSession | null {
	try {
		return JSON.parse(localStorage.getItem(storageKey) ?? 'null');
	} catch {
		return null;
	}
}

/**
 * Fake sign-in for the prototype. Credentials are checked by the mock API; the chosen user and tenant
 * stay in local storage the way the real HttpOnly session cookie would survive a reload.
 */
export class Session {
	status = $state<SessionStatus>('loading');
	user = $state<User | null>(null);
	memberships = $state<Membership[]>([]);
	tenants = $state<Tenant[]>([]);
	roles = $state<Role[]>([]);
	tenantId = $state<TenantId | null>(null);
	impersonatorId = $state<UserId | null>(null);

	tenant = $derived(this.tenants.find((tenant) => tenant.id === this.tenantId) ?? null);
	membership = $derived(this.memberships.find((membership) => membership.tenantId === this.tenantId) ?? null);
	role = $derived(this.roles.find((role) => role.id === this.membership?.roleId) ?? null);
	isSuperAdministrator = $derived(this.user?.globalRole === 'super_administrator');
	displayName = $derived(this.user ? `${this.user.firstName} ${this.user.lastName}`.trim() : '');

	#account: AccountApi;
	#pendingUserId: UserId | null = null;

	constructor(account: AccountApi) {
		this.#account = account;
	}

	/** The mock API reads the caller from here, before any reactive state has settled. */
	callerId(): UserId | null {
		return this.status === 'authenticated' || this.status === 'verify_email' ? (this.user?.id ?? null) : null;
	}

	can(permission: Permission): boolean {
		return roleGrants(this.role, permission);
	}

	hasModule(module: ModuleKey): boolean {
		return this.tenant !== null && moduleBooked(this.tenant, module);
	}

	/** Settles once the stored session has been checked. */
	ready: Promise<void> = Promise.resolve();

	restore(): Promise<void> {
		this.ready = this.#restore();
		return this.ready;
	}

	async #restore() {
		const stored = readStored();
		if (!stored) {
			this.status = 'anonymous';
			return;
		}
		this.user = { id: stored.userId } as User;
		this.status = stored.verified ? 'authenticated' : 'verify_email';
		try {
			await this.#load(stored.userId, stored.tenantId);
			this.impersonatorId = stored.impersonatorId;
		} catch {
			this.#clear();
		}
	}

	async signIn(email: string, password: string): Promise<SessionStatus> {
		const user = await this.#account.signIn(email, password);
		if (user.twoFactorEnabled) {
			this.#pendingUserId = user.id;
			this.status = 'two_factor';
			return this.status;
		}
		await this.#establish(user);
		return this.status;
	}

	async confirmTwoFactor(code: string) {
		if (!this.#pendingUserId) return;
		await this.#account.verifyTwoFactor(code);
		const snapshot = await this.#account.snapshotFor(this.#pendingUserId);
		this.#pendingUserId = null;
		await this.#establish(snapshot.user);
	}

	cancelTwoFactor() {
		this.#pendingUserId = null;
		this.status = 'anonymous';
	}

	async signUp(input: { firstName: string; lastName: string; email: string; password: string }) {
		const user = await this.#account.signUp(input);
		this.user = user;
		this.status = 'verify_email';
		this.#persist(false);
	}

	async verifyEmail(code: string) {
		if (!this.user) return;
		const user = await this.#account.verifyEmail(this.user.id, code);
		await this.#establish(user);
	}

	async switchTenant(tenantId: TenantId) {
		if (!this.memberships.some((membership) => membership.tenantId === tenantId)) return;
		this.tenantId = tenantId;
		this.#persist(true);
	}

	/** Re-reads user, tenants and roles after they were changed elsewhere. */
	async refresh() {
		if (this.user && this.status === 'authenticated') await this.#load(this.user.id, this.tenantId);
	}

	async impersonate(userId: UserId, tenantId: TenantId) {
		if (!this.isSuperAdministrator || !this.user) return;
		const administratorId = this.user.id;
		await this.#load(userId, tenantId);
		this.impersonatorId = administratorId;
		this.#persist(true);
	}

	async stopImpersonating() {
		if (!this.impersonatorId) return;
		const administratorId = this.impersonatorId;
		this.impersonatorId = null;
		await this.#load(administratorId, null);
		this.#persist(true);
	}

	signOut() {
		this.#clear();
	}

	async #establish(user: User) {
		this.user = user;
		this.status = 'authenticated';
		await this.#load(user.id, null);
		this.#persist(true);
	}

	async #load(userId: UserId, preferredTenant: TenantId | null) {
		const snapshot = await this.#account.snapshotFor(userId);
		this.user = snapshot.user;
		this.memberships = snapshot.memberships;
		this.tenants = snapshot.tenants;
		this.roles = snapshot.roles;
		const available = snapshot.memberships.map((membership) => membership.tenantId);
		this.tenantId = preferredTenant && available.includes(preferredTenant) ? preferredTenant : (available[0] ?? null);
	}

	#persist(verified: boolean) {
		if (!this.user) return;
		const value: StoredSession = { userId: this.user.id, tenantId: this.tenantId, impersonatorId: this.impersonatorId, verified };
		try {
			localStorage.setItem(storageKey, JSON.stringify(value));
		} catch {
			// The session then lasts until the page is reloaded.
		}
	}

	#clear() {
		this.status = 'anonymous';
		this.user = null;
		this.memberships = [];
		this.tenants = [];
		this.roles = [];
		this.tenantId = null;
		this.impersonatorId = null;
		try {
			localStorage.removeItem(storageKey);
		} catch {
			// Nothing to clean up.
		}
	}
}
