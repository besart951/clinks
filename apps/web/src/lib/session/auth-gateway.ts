import type { InvitationDetails } from '@clinks/contracts/auth';
import type { TenantId, UserId } from '@clinks/domain/ids';
import type { Industry, ModuleKey, User } from '@clinks/domain/types';
import type { Snapshot } from '../data/database.ts';

export type SignInStep =
	{ status: 'authenticated'; userId: UserId } | { status: 'two_factor' } | { status: 'verify_email' };

/** What the session remembered across a reload. */
export interface StoredSession {
	userId: UserId;
	tenantId: TenantId | null;
	impersonatorId: UserId | null;
	verified: boolean;
}

export interface NewTenant {
	companyName: string;
	industry: Industry;
	modules: ModuleKey[];
	invites: string[];
	demoData: boolean;
}

/**
 * Who is signed in and how they got there. The mock gateway checks credentials against the in-browser
 * database (the prototype and the e2e tests); the remote gateway signs in against the CLinks API.
 * Either way the session then reads the account from the local database.
 */
export interface AuthGateway {
	/** True when sign-in goes through the real API (no demo codes). */
	readonly remote: boolean;
	/** The account behind a stored session after a reload; null when it is gone. Throws when offline. */
	resume(stored: StoredSession | null): Promise<{ userId: UserId; verified: boolean } | null>;
	signIn(email: string, password: string): Promise<SignInStep>;
	confirmTwoFactor(code: string): Promise<UserId>;
	/**
	 * Starts a sign-up; the address is confirmed with `verifyEmail`. The mock returns the new user so the
	 * pending sign-up survives a reload; the API keeps unverified accounts to itself and returns null.
	 */
	signUp(input: { firstName: string; lastName: string; email: string; password: string }): Promise<User | null>;
	verifyEmail(code: string, pendingUserId: UserId | null): Promise<UserId>;
	resendVerification(): Promise<void>;
	switchTenant(tenantId: TenantId): Promise<void>;
	signOut(): Promise<void>;
	requestPasswordReset(email: string): Promise<void>;
	/** `token` is the code from the demo screen or the token from the link in the mail. */
	resetPassword(input: { email: string; token: string; password: string }): Promise<void>;
	/** Onboarding: creates the tenant, invites the team and, if asked, fills it with demo data. */
	createTenant(input: NewTenant, demoRows: (tenantId: TenantId) => Partial<Snapshot>): Promise<TenantId>;
	invitationDetails(token: string): Promise<InvitationDetails>;
	/** Returns the tenant and, for a new account, the user it is now signed in as. */
	acceptInvitation(
		token: string,
		input: { firstName: string; lastName: string; password?: string },
	): Promise<{ tenantId: TenantId; signedInAs: UserId | null }>;
}
