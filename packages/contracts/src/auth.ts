import { industries, moduleKeys, permissions } from '@clinks/domain/types';
import { storageProblems, storageProviders } from '@clinks/domain/storage';
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
export const disableTwoFactorRequest = z.object({
	/** A 6-digit TOTP code or a recovery code (xxxx-xxxx-xxxx). */
	code: z.string().trim().min(6).max(20),
	password: z.string().min(1).max(200),
});
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

const image = z
	.string()
	.max(1_350_000)
	.regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/u)
	.nullable();
const address = z.object({
	street: z.string().max(256),
	houseNumber: z.string().max(16).default(''),
	zip: z.string().max(24),
	city: z.string().max(128),
});
const preferences = z.object({
	inApp: z.boolean(),
	email: z.boolean(),
	push: z.boolean(),
	digest: z.enum(['never', 'daily', 'weekly']),
});
export const profileUpdate = z
	.strictObject({
		firstName: name,
		lastName: name,
		locale: z.enum(['de-CH', 'en-US']),
		avatarDataUrl: image,
		notificationPreferences: preferences,
	})
	.partial();
export const invoiceSettings = z.strictObject({
	paymentTermDays: z.number().int().min(0).max(120),
	footer: z.string().max(500),
	delivery: z.enum(['auto', 'attachment', 'link']),
	reminders: z
		.array(
			z.strictObject({
				days: z.number().int().min(1).max(90),
				fee: z.number().int().min(0).max(10_000),
				text: z.string().max(1000),
			}),
		)
		.max(3),
	defaultInterest: z.boolean(),
});
export const companyUpdate = z
	.strictObject({
		name: z.string().trim().min(1).max(200),
		logoDataUrl: image,
		address,
		vatNumber: z.string().max(50),
		iban: z.string().max(36),
		qrIban: z.string().max(36),
		invoiceSettings,
		brandColor: z.string().regex(/^#[a-f0-9]{6}$/iu),
		locale: z.enum(['de-CH', 'en-US']),
		timeZone: z.enum(['Europe/Zurich', 'Europe/Berlin', 'Europe/Vienna']),
	})
	.partial();
export const userDto = z.object({
	id: uuid,
	email: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	avatarColor: z.string(),
	locale: z.string(),
	avatarDataUrl: image,
	notificationPreferences: preferences,
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
	logoDataUrl: image,
	address,
	vatNumber: z.string(),
	iban: z.string(),
	qrIban: z.string(),
	invoiceSettings,
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
	template: z.string().nullable(),
});

export const membershipDto = z.object({
	id: uuid,
	tenantId: uuid,
	userId: uuid,
	roleId: uuid,
	status: z.enum(['active', 'inactive']),
	jobTitle: z.string(),
});

export const memberUpdate = z
	.strictObject({
		roleId: uuid,
		status: z.enum(['active', 'inactive']),
		jobTitle: z.string().max(128),
		/** With `status: 'inactive'`: the person's future Spitex visits go back to the open visits. */
		releaseVisits: z.boolean(),
	})
	.partial();
export const roleUpdate = z.strictObject({
	id: uuid.nullable(),
	name: z.string().trim().min(1).max(128),
	permissions: z.array(z.enum(permissions)).max(permissions.length),
});
export const teamResponse = z.object({
	roles: z.array(roleDto),
	people: z.array(
		z.object({
			membership: membershipDto,
			user: userDto.pick({
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				avatarColor: true,
				avatarDataUrl: true,
			}),
			/** Sign-in activity in this workspace; only for those who manage the team. */
			access: z.object({ lastActiveAt: z.iso.datetime().nullable(), devices: z.number().int() }).nullable(),
		}),
	),
});
export type TeamResponse = z.infer<typeof teamResponse>;
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
	invitedBy: uuid,
	createdAt: z.iso.datetime(),
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

/** A tenant's document storage. Shapes only; the rules (secret kept, consent) are checked by the API. */
export const storageInput = z.strictObject({
	provider: z.enum(storageProviders),
	endpoint: z.string().max(500),
	region: z.string().max(100),
	bucket: z.string().max(100),
	accessKeyId: z.string().max(200),
	secretAccessKey: z.string().max(500),
	pathStyle: z.boolean(),
	acknowledgeLocation: z.boolean(),
});

export const storageCheck = z.object({
	at: z.iso.datetime(),
	ok: z.boolean(),
	problems: z.array(z.enum(storageProblems)).optional(),
});

export const storageView = z.object({
	id: z.uuid(),
	tenantId: z.uuid(),
	revision: z.int(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	provider: z.enum(storageProviders),
	endpoint: z.string(),
	region: z.string(),
	bucket: z.string(),
	accessKeyId: z.string(),
	pathStyle: z.boolean(),
	locationAcknowledgedAt: z.iso.datetime().nullable(),
	lastCheck: storageCheck.pick({ at: true, ok: true }).nullable(),
	secretHint: z.string().nullable(),
});
