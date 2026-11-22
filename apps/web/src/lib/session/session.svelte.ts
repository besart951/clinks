import type { TenantId, UserId } from '@clinks/domain/ids';
import { moduleBooked, roleGrants } from '@clinks/domain/permissions';
import type { Membership, ModuleKey, Permission, Role, Tenant, User } from '@clinks/domain/types';
import type { AccountApi } from '../data/account-api.ts';
import { MockApiError } from '../data/database.ts';
import type { SecureStorage } from '../platform/types.ts';
import type { AuthGateway, StoredSession } from './auth-gateway.ts';

export type SessionStatus = 'loading' | 'anonymous' | 'two_factor' | 'verify_email' | 'authenticated';

const storageKey = 'clinks.workspace.session';
const cacheKey = 'clinks.workspace.session.cache';

type SessionSnapshot = Awaited<ReturnType<AccountApi['snapshotFor']>>;

function parse<T>(raw: string | null): T | null {
	try {
		return raw === null ? null : (JSON.parse(raw) as T);
	} catch {
		return null;
	}
}

/**
 * The signed-in person. The gateway decides who that is (demo credentials or the real API); the account,
 * tenants and roles are then read from the local database. Only ids are stored, never a token.
 */
export class Session {
	status = $state<SessionStatus>('loading');
	user = $state<User | null>(null);
	/** The address a sign-up waits to have confirmed, before there is a user to show. */
	pendingEmail = $state('');
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

	readonly #account: AccountApi;
	readonly #gateway: AuthGateway;
	readonly #secure: SecureStorage;

	constructor(account: AccountApi, gateway: AuthGateway, secure: SecureStorage) {
		this.#account = account;
		this.#gateway = gateway;
		this.#secure = secure;
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
		const stored = parse<StoredSession>(this.#secure.read(storageKey));
		try {
			const resumed = await this.#gateway.resume(stored);
			if (!resumed) return this.#clear();
			this.user = { id: resumed.userId } as User;
			this.status = resumed.verified ? 'authenticated' : 'verify_email';
			await this.#load(resumed.userId, stored?.tenantId ?? null);
			this.impersonatorId = stored?.userId === resumed.userId ? stored.impersonatorId : null;
			await this.#selectTenant();
		} catch (error) {
			// Offline or a flaky connection: the last snapshot still opens the workspace.
			const cached =
				stored && error instanceof MockApiError && error.code !== 'unauthorized'
					? this.#readCache(stored.userId)
					: null;
			if (!cached || !stored) return this.#clear();
			this.status = stored.verified ? 'authenticated' : 'verify_email';
			this.#apply(cached, stored.tenantId);
			this.impersonatorId = stored.impersonatorId;
		}
	}

	async signIn(email: string, password: string): Promise<SessionStatus> {
		await this.ready;
		const step = await this.#gateway.signIn(email, password);
		if (step.status === 'authenticated') await this.#establish(step.userId);
		else {
			this.pendingEmail = email;
			this.status = step.status;
		}
		return this.status;
	}

	async confirmTwoFactor(code: string) {
		await this.#establish(await this.#gateway.confirmTwoFactor(code));
	}

	cancelTwoFactor() {
		this.status = 'anonymous';
	}

	async signUp(input: { firstName: string; lastName: string; email: string; password: string }) {
		await this.ready;
		const user = await this.#gateway.signUp(input);
		this.user = user;
		this.pendingEmail = input.email;
		this.status = 'verify_email';
		this.#persist(false);
	}

	async verifyEmail(code: string) {
		await this.#establish(await this.#gateway.verifyEmail(code, this.user?.id ?? null));
	}

	resendVerification() {
		return this.#gateway.resendVerification();
	}

	async switchTenant(tenantId: TenantId) {
		if (!this.memberships.some((membership) => membership.tenantId === tenantId)) return;
		await this.#gateway.switchTenant(tenantId);
		this.tenantId = tenantId;
		this.#persist(true);
	}

	/** Re-reads user, tenants and roles after they were changed elsewhere. */
	async refresh() {
		if (this.user && this.status === 'authenticated') await this.#load(this.user.id, this.tenantId);
	}

	/** Signs in as an account the gateway has just opened (e.g. by accepting an invitation). */
	async adopt(userId: UserId, tenantId: TenantId) {
		await this.#establish(userId);
		await this.switchTenant(tenantId);
	}

	async impersonate(userId: UserId, tenantId: TenantId) {
		if (this.#gateway.remote || !this.isSuperAdministrator || !this.user) return;
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

	async signOut() {
		await this.#gateway.signOut();
		this.#clear();
	}

	async #establish(userId: UserId) {
		this.user = { id: userId } as User;
		this.status = 'authenticated';
		await this.#load(userId, null);
		await this.#selectTenant();
		this.#persist(true);
	}

	/** The gateway works in the same tenant as the session (the API's token carries it). */
	async #selectTenant() {
		if (this.tenantId) await this.#gateway.switchTenant(this.tenantId);
	}

	async #load(userId: UserId, preferredTenant: TenantId | null) {
		const snapshot = await this.#account.snapshotFor(userId);
		this.#secure.write(cacheKey, JSON.stringify(snapshot));
		this.#apply(snapshot, preferredTenant);
	}

	/** Uses a session snapshot, from the API or from the offline cache. */
	#apply(snapshot: SessionSnapshot, preferredTenant: TenantId | null) {
		this.user = snapshot.user;
		this.memberships = snapshot.memberships;
		this.tenants = snapshot.tenants;
		this.roles = snapshot.roles;
		const available = snapshot.memberships.map((membership) => membership.tenantId);
		this.tenantId = preferredTenant && available.includes(preferredTenant) ? preferredTenant : (available[0] ?? null);
	}

	/** The last session snapshot, so an offline reload still opens the workspace. */
	#readCache(userId: UserId): SessionSnapshot | null {
		const cached = parse<SessionSnapshot>(this.#secure.read(cacheKey));
		return cached?.user.id === userId ? cached : null;
	}

	#persist(verified: boolean) {
		if (!this.user) return;
		const value: StoredSession = {
			userId: this.user.id,
			tenantId: this.tenantId,
			impersonatorId: this.impersonatorId,
			verified,
		};
		this.#secure.write(storageKey, JSON.stringify(value));
	}

	#clear() {
		this.status = 'anonymous';
		this.user = null;
		this.pendingEmail = '';
		this.memberships = [];
		this.tenants = [];
		this.roles = [];
		this.tenantId = null;
		this.impersonatorId = null;
		this.#secure.remove(storageKey);
		this.#secure.remove(cacheKey);
	}
}
