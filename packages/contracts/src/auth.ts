import { industries, moduleKeys, permissions } from '@clinks/domain/types';
import { z } from 'zod';

/**
 * Request and response bodies of the auth and account API. The API validates requests with these
 * schemas and publishes them as OpenAPI; the web app types its client from them.
 */

const email = z
	.email()
	.max(254)
	.transform((value) => value.trim().toLowerCase());
const password = z.string().min(10).max(200);
const name = z.string().trim().min(1).max(100);
const code = z
	.string()
	.trim()
	.regex(/^[0-9]{6}$/);
const uuid = z.uuid();

export const signUpRequest = z.object({ firstName: name, lastName: name, email, password });
export const signInRequest = z.object({ email, password: z.string().min(1).max(200) });
export const twoFactorRequest = z.object({
	challengeId: uuid,
	/** A 6-digit TOTP code or a recovery code (xxxx-xxxx-xxxx). */
	code: z.string().trim().min(6).max(20),
});
export const verifyEmailRequest = z.object({ verificationId: uuid, code });
export const resendVerificationRequest = z.object({ verificationId: uuid });
export const passwordResetRequest = z.object({ email });
export const passwordResetConfirm = z.object({ token: z.string().min(20).max(200), password });
export const refreshRequest = z.object({ refreshToken: z.string().min(20).max(200).optional() });
export const switchTenantRequest = z.object({ tenantId: uuid });
export const changePasswordRequest = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });
export const twoFactorCodeRequest = z.object({ code });
export const createTenantRequest = z.object({
	name: z.string().trim().min(1).max(200),
	industry: z.enum(industries),
	modules: z.array(z.enum(moduleKeys)).max(moduleKeys.length),
});
export const inviteRequest = z.object({ email, roleId: uuid });
export const acceptInvitationRequest = z.object({
	firstName: name,
	lastName: name,
	/** Needed only when the invited address has no account yet. */
	password: password.optional(),
});

/** A signed-in device. The refresh token is in the body only for native clients; browsers get a cookie. */
export const sessionResponse = z.object({
	accessToken: z.string(),
	expiresAt: z.iso.datetime(),
	refreshToken: z.string().optional(),
});

export const signInResponse = z.discriminatedUnion('status', [
	z.object({ status: z.literal('authenticated'), session: sessionResponse }),
	z.object({ status: z.literal('two_factor'), challengeId: uuid }),
	z.object({ status: z.literal('verify_email'), verificationId: uuid }),
]);

export const verificationResponse = z.object({ verificationId: uuid });

export const userDto = z.object({
	id: uuid,
	email: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	avatarColor: z.string(),
	locale: z.string(),
	globalRole: z.literal('super_administrator').nullable(),
	emailVerified: z.boolean(),
	twoFactorEnabled: z.boolean(),
});

export const tenantDto = z.object({
	id: uuid,
	name: z.string(),
	industry: z.enum(industries),
	brandColor: z.string(),
	locale: z.string(),
	timeZone: z.string(),
	plan: z.string(),
	billingCycle: z.enum(['monthly', 'yearly']),
	trialEndsAt: z.iso.datetime().nullable(),
	enabledModules: z.array(z.enum(moduleKeys)),
	featureFlags: z.array(z.string()),
	onboardingCompleted: z.boolean(),
});

export const roleDto = z.object({
	id: uuid,
	tenantId: uuid,
	name: z.string(),
	kind: z.enum(['administrator', 'user', 'custom']),
	permissions: z.array(z.enum(permissions)),
});

export const membershipDto = z.object({
	id: uuid,
	tenantId: uuid,
	userId: uuid,
	roleId: uuid,
	status: z.enum(['active', 'inactive']),
	jobTitle: z.string(),
});

export const meResponse = z.object({
	user: userDto,
	tenantId: uuid.nullable(),
	tenants: z.array(tenantDto),
	roles: z.array(roleDto),
	memberships: z.array(membershipDto),
});

export const deviceSessionDto = z.object({
	id: uuid,
	device: z.string(),
	ip: z.string().nullable(),
	lastActiveAt: z.iso.datetime(),
	current: z.boolean(),
});

export const twoFactorSetupResponse = z.object({ secret: z.string(), otpauthUri: z.string() });
export const recoveryCodesResponse = z.object({ recoveryCodes: z.array(z.string()) });

export const invitationDto = z.object({
	id: uuid,
	email: z.string(),
	roleId: uuid,
	status: z.enum(['pending', 'accepted', 'revoked']),
	expiresAt: z.iso.datetime(),
});

export const invitationDetailsResponse = z.object({
	tenantName: z.string(),
	email: z.string(),
	roleName: z.string(),
	expiresAt: z.iso.datetime(),
	/** Whether the invited address already has an account (then it signs in instead of choosing a password). */
	hasAccount: z.boolean(),
});

export const acceptInvitationResponse = z.object({ tenantId: uuid, session: sessionResponse.optional() });

/** Every error carries a catalog key and the message already localized for the caller. */
export const errorResponse = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		fields: z.record(z.string(), z.string()).optional(),
	}),
});

export type SignUpRequest = z.input<typeof signUpRequest>;
export type SignInResponse = z.infer<typeof signInResponse>;
export type SessionResponse = z.infer<typeof sessionResponse>;
export type MeResponse = z.infer<typeof meResponse>;
export type UserDto = z.infer<typeof userDto>;
export type TenantDto = z.infer<typeof tenantDto>;
export type DeviceSessionDto = z.infer<typeof deviceSessionDto>;
export type InvitationDetails = z.infer<typeof invitationDetailsResponse>;
export type CreateTenantRequest = z.input<typeof createTenantRequest>;
export type ErrorResponse = z.infer<typeof errorResponse>;
