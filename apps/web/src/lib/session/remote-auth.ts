import type { InvitationDetails, MeResponse, SessionResponse, SignInResponse } from '@clinks/contracts/auth';
import type { MembershipId, RoleId, TenantId, UserId } from '@clinks/domain/ids';
import type { Membership, Permission, PlanCode, Role, Tenant, User } from '@clinks/domain/types';
import type { ApiClient } from '../data/api-client.ts';
import type { MockDatabase, Snapshot } from '../data/database.ts';
import type { AuthGateway, NewTenant, SignInStep } from './auth-gateway.ts';

/**
 * Sign-in against the CLinks API. After each sign-in the account (user, tenants, roles, memberships) is
 * copied into the local database, because the other screens still read from it until phase 4.
 */
export class RemoteAuthGateway implements AuthGateway {
	readonly remote = true;
	readonly #client: ApiClient;
	readonly #db: MockDatabase;
	#challengeId: string | null = null;
	#verificationId: string | null = null;

	constructor(client: ApiClient, db: MockDatabase) {
		this.#client = client;
		this.#db = db;
	}

	async resume() {
		if (!(await this.#client.refresh())) return null;
		return { userId: await this.#mirror(), verified: true };
	}

	async signIn(email: string, password: string): Promise<SignInStep> {
		const result = await this.#client.request<SignInResponse>('POST', '/auth/sign-in', { email, password });
		if (result.status === 'two_factor') this.#challengeId = result.challengeId;
		if (result.status === 'verify_email') this.#verificationId = result.verificationId;
		if (result.status !== 'authenticated') return { status: result.status };
		return { status: 'authenticated', userId: await this.#adopt(result.session) };
	}

	async confirmTwoFactor(code: string): Promise<UserId> {
		const session = await this.#client.request<SessionResponse>('POST', '/auth/two-factor', {
			challengeId: this.#challengeId,
			code,
		});
		this.#challengeId = null;
		return this.#adopt(session);
	}

	async signUp(input: { firstName: string; lastName: string; email: string; password: string }) {
		this.#verificationId = (
			await this.#client.request<{ verificationId: string }>('POST', '/auth/sign-up', input)
		).verificationId;
		return null;
	}

	async verifyEmail(code: string): Promise<UserId> {
		const session = await this.#client.request<SessionResponse>('POST', '/auth/verify-email', {
			verificationId: this.#verificationId,
			code,
		});
		this.#verificationId = null;
		return this.#adopt(session);
	}

	async resendVerification() {
		const result = await this.#client.request<{ verificationId: string }>('POST', '/auth/verify-email/resend', {
			verificationId: this.#verificationId,
		});
		this.#verificationId = result.verificationId;
	}

	async switchTenant(tenantId: TenantId) {
		this.#client.adopt(await this.#client.request<SessionResponse>('POST', '/me/tenant', { tenantId }));
	}

	async signOut() {
		await this.#client.request('POST', '/auth/sign-out', {}).catch(() => undefined);
		this.#client.forget();
	}

	requestPasswordReset(email: string) {
		return this.#client.request<void>('POST', '/auth/password-reset/request', { email });
	}

	resetPassword(input: { token: string; password: string }) {
		return this.#client.request<void>('POST', '/auth/password-reset', { token: input.token, password: input.password });
	}

	async createTenant(input: NewTenant, demoRows: (tenantId: TenantId) => Partial<Snapshot>): Promise<TenantId> {
		const { tenantId } = await this.#client.request<{ tenantId: TenantId }>('POST', '/tenants', {
			name: input.companyName,
			industry: input.industry,
			modules: input.modules,
		});
		await this.switchTenant(tenantId);
		const me = await this.#loadAccount();
		const userRole = me.roles.find((role) => role.tenantId === tenantId && role.kind === 'user');
		// The tenant exists now; a failed invitation must not fail onboarding (it can be sent again in settings).
		const invitations = userRole ? input.invites : [];
		await Promise.allSettled(
			invitations.map((email) => this.#client.request('POST', '/tenant/invitations', { email, roleId: userRole!.id })),
		);
		if (input.demoData) this.#db.merge(demoRows(tenantId));
		return tenantId;
	}

	invitationDetails(token: string) {
		return this.#client.request<InvitationDetails>('GET', `/invitations/${encodeURIComponent(token)}`);
	}

	async acceptInvitation(token: string, input: { firstName: string; lastName: string; password?: string }) {
		const result = await this.#client.request<{ tenantId: TenantId; session?: SessionResponse }>(
			'POST',
			`/invitations/${encodeURIComponent(token)}/accept`,
			input,
		);
		if (result.session) return { tenantId: result.tenantId, signedInAs: await this.#adopt(result.session) };
		await this.#loadAccount();
		return { tenantId: result.tenantId, signedInAs: null };
	}

	async #adopt(session: SessionResponse): Promise<UserId> {
		this.#client.adopt(session);
		return this.#mirror();
	}

	async #mirror(): Promise<UserId> {
		return (await this.#loadAccount()).user.id as UserId;
	}

	/** Reads the account from the API and copies it into the local database. */
	async #loadAccount(): Promise<MeResponse> {
		const me = await this.#client.request<MeResponse>('GET', '/me');
		this.#db.merge(localRows(this.#db, me));
		return me;
	}
}

/** The API's account as rows of the local database, keeping local-only fields (logo, address, …). */
function localRows(db: MockDatabase, me: MeResponse): Partial<Snapshot> {
	const now = new Date().toISOString();
	const stamps = (existing: { revision: number; createdAt: string } | undefined) => ({
		revision: (existing?.revision ?? 0) + 1,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	});
	const localUser = db.table('users').find((row) => row.id === me.user.id);
	const user: User = {
		avatarDataUrl: null,
		password: '',
		notificationPreferences: { inApp: true, email: true, push: false, digest: 'daily' },
		...localUser,
		...me.user,
		id: me.user.id as UserId,
		...stamps(localUser),
	};
	const tenants = me.tenants.map((tenant): Tenant => {
		const local = db.table('tenants').find((row) => row.id === tenant.id);
		return {
			logoDataUrl: null,
			address: { street: '', zip: '', city: '' },
			vatNumber: '',
			iban: '',
			cancelledAt: null,
			paymentMethod: null,
			...local,
			...tenant,
			id: tenant.id as TenantId,
			plan: tenant.plan as PlanCode,
			...stamps(local),
		};
	});
	const roles = me.roles.map((role): Role => ({
		...role,
		id: role.id as RoleId,
		tenantId: role.tenantId as TenantId,
		permissions: role.permissions as Permission[],
		...stamps(db.table('roles').find((row) => row.id === role.id)),
	}));
	const memberships = me.memberships.map((membership): Membership => ({
		...membership,
		id: membership.id as MembershipId,
		tenantId: membership.tenantId as TenantId,
		userId: membership.userId as UserId,
		roleId: membership.roleId as RoleId,
		...stamps(db.table('memberships').find((row) => row.id === membership.id)),
	}));
	return { users: [user], tenants, roles, memberships };
}
