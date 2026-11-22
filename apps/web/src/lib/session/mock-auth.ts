import type { InvitationDetails } from '@clinks/contracts/auth';
import type { InvitationId, TenantId, UserId } from '@clinks/domain/ids';
import type { AccountApi } from '../data/account-api.ts';
import { MockApiError, type Snapshot } from '../data/database.ts';
import { demoPassword } from '../data/seed.ts';
import type { AuthGateway, NewTenant, SignInStep, StoredSession } from './auth-gateway.ts';

/** Sign-in against the in-browser database: demo codes, no mails, nothing leaves the browser. */
export class MockAuthGateway implements AuthGateway {
	readonly remote = false;
	readonly #account: AccountApi;
	readonly #localize: (key: string) => string;
	#twoFactorUser: UserId | null = null;

	constructor(account: AccountApi, localize: (key: string) => string) {
		this.#account = account;
		this.#localize = localize;
	}

	async resume(stored: StoredSession | null) {
		return stored ? { userId: stored.userId, verified: stored.verified } : null;
	}

	async signIn(email: string, password: string): Promise<SignInStep> {
		const user = await this.#account.signIn(email, password);
		if (!user.twoFactorEnabled) return { status: 'authenticated', userId: user.id };
		this.#twoFactorUser = user.id;
		return { status: 'two_factor' };
	}

	async confirmTwoFactor(code: string): Promise<UserId> {
		const userId = this.#twoFactorUser;
		if (!userId) throw new MockApiError('unauthorized', this.#localize('error.unauthorized'));
		await this.#account.verifyTwoFactor(code);
		this.#twoFactorUser = null;
		return userId;
	}

	signUp(input: { firstName: string; lastName: string; email: string; password: string }) {
		return this.#account.signUp(input);
	}

	async verifyEmail(code: string, pendingUserId: UserId | null): Promise<UserId> {
		if (!pendingUserId) throw new MockApiError('unauthorized', this.#localize('error.unauthorized'));
		return (await this.#account.verifyEmail(pendingUserId, code)).id;
	}

	async resendVerification() {}

	async switchTenant() {}

	async signOut() {}

	requestPasswordReset(email: string) {
		return this.#account.requestPasswordReset(email);
	}

	resetPassword(input: { email: string; token: string; password: string }) {
		return this.#account.resetPassword(input.email, input.token, input.password);
	}

	async createTenant(input: NewTenant, demoRows: (tenantId: TenantId) => Partial<Snapshot>): Promise<TenantId> {
		return (await this.#account.completeOnboarding(input, demoRows)).id;
	}

	async invitationDetails(token: string): Promise<InvitationDetails> {
		const details = await this.#account.invitationDetails(token as InvitationId);
		return {
			tenantName: details.tenantName,
			email: details.invitation.email,
			roleName: details.roleName,
			expiresAt: details.invitation.expiresAt,
			hasAccount: details.existingUser,
		};
	}

	/** A new account signs in right away, the way the link in the real mail does. */
	async acceptInvitation(token: string, input: { firstName: string; lastName: string; password?: string }) {
		const details = await this.#account.invitationDetails(token as InvitationId);
		const membership = await this.#account.acceptInvitation(token as InvitationId, input);
		if (details.existingUser) return { tenantId: membership.tenantId, signedInAs: null };
		const user = await this.#account.signIn(details.invitation.email, input.password ?? demoPassword);
		return { tenantId: membership.tenantId, signedInAs: user.id };
	}
}
