import { SettingsService } from './services/settings.ts';
import { StorageService } from './services/storage.ts';
import { BillingService, checkoutRequest } from './services/billing.ts';
import * as contract from '@clinks/contracts/auth';
import { syncImportRequest, syncWriteRequest } from '@clinks/contracts/sync';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createRoute, OpenAPIHono, type RouteConfig } from '@hono/zod-openapi';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import { z, type ZodError, type ZodType } from 'zod';
import type { Config } from './config.ts';
import { ApiError, unauthorized } from './errors.ts';
import { pickLocale, translate } from './i18n.ts';
import { AuthService } from './services/auth.ts';
import type { Caller, Services } from './services/context.ts';
import { SessionService, type OpenedSession } from './services/sessions.ts';
import { FileService, versionUpload } from './services/files.ts';
import { SyncService } from './services/sync.ts';
import { TenantService } from './services/tenants.ts';
import type { AccessClaims } from './tokens.ts';

type Env = { Variables: { claims: AccessClaims } };

const refreshCookie = 'clinks_refresh';
const refreshCookieSeconds = 30 * 24 * 60 * 60;

export interface AppOptions {
	services: Services;
	config: Pick<Config, 'WEB_ORIGIN' | 'COOKIE_SECURE' | 'TRUST_PROXY'>;
}

export function createApp({ services, config }: AppOptions) {
	const sessions = new SessionService(services);
	const auth = new AuthService(services, sessions);
	const tenants = new TenantService(services, sessions);
	const sync = new SyncService(services);
	const app = new OpenAPIHono<Env>({
		defaultHook: validationHook,
	});

	app.use(secureHeaders());
	app.use(
		cors({
			origin: config.WEB_ORIGIN,
			credentials: true,
			allowHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'X-Clinks-Client'],
			allowMethods: ['GET', 'POST', 'DELETE'],
			maxAge: 600,
		}),
	);
	const limit = (maxSize: number) =>
		bodyLimit({
			maxSize,
			onError: () => {
				throw new ApiError(413, 'error.validation');
			},
		});
	const defaultLimit = limit(1024 * 1024);
	const writeLimit = limit(2 * 1024 * 1024); // One base64-encoded document plus metadata.
	const importLimit = limit(12 * 1024 * 1024); // One legacy browser workspace, including JSON escaping.
	app.use((c, next) => {
		if (c.req.path === '/sync/import') return importLimit(c, next);
		if (['/sync/write', '/tenant/settings', '/me/profile'].includes(c.req.path)) return writeLimit(c, next);
		return defaultLimit(c, next);
	});

	app.onError((error, c) => {
		const locale = pickLocale(c.req.header('Accept-Language'));
		if (c.req.path === '/webhooks/stripe')
			console.warn(
				JSON.stringify({ event: 'billing.webhook_failed', status: error instanceof ApiError ? error.status : 500 }),
			);
		if (error instanceof ApiError) return c.json(errorBody(locale, error.key, error.fields), error.status);
		console.error(JSON.stringify({ event: 'api.failure', method: c.req.method, errorType: error.name }));
		return c.json(errorBody(locale, 'error.internal'), 500);
	});
	app.notFound((c) => c.json(errorBody(pickLocale(c.req.header('Accept-Language')), 'error.ws.not_found'), 404));

	/** Requires a valid access token from a device that is still signed in. */
	const signedIn = createMiddleware<Env>(async (c, next) => {
		const claims = await claimsOf(c);
		if (!claims) throw unauthorized();
		c.set('claims', claims);
		await next();
	});

	async function claimsOf(c: Context): Promise<AccessClaims | null> {
		const header = c.req.header('Authorization');
		if (!header?.startsWith('Bearer ')) return null;
		const claims = await services.tokens.verify(header.slice(7), services.now()).catch(() => null);
		return claims && (await sessions.isActive(claims)) ? claims : null;
	}

	function caller(c: Context): Caller {
		// The last entry is the one Caddy appended; earlier ones come from the client and can be made up.
		const forwarded = config.TRUST_PROXY ? c.req.header('X-Forwarded-For')?.split(',').at(-1)?.trim() : undefined;
		let ip = forwarded ?? null;
		if (!ip) {
			try {
				ip = getConnInfo(c).remote.address ?? null;
			} catch {
				ip = null;
			}
		}
		return {
			ip,
			device: (c.req.header('User-Agent') ?? '').slice(0, 200),
			locale: pickLocale(c.req.header('Accept-Language')),
		};
	}

	/** Browsers get the refresh token as an HttpOnly cookie that scripts cannot read; native apps get it in the body. */
	function deliver(c: Context, opened: OpenedSession): contract.SessionResponse {
		const session = { accessToken: opened.accessToken, expiresAt: opened.expiresAt };
		if (c.req.header('X-Clinks-Client') === 'native') return { ...session, refreshToken: opened.refreshToken };
		setCookie(c, refreshCookie, opened.refreshToken, {
			httpOnly: true,
			secure: config.COOKIE_SECURE,
			sameSite: 'Strict',
			path: '/auth',
			maxAge: refreshCookieSeconds,
		});
		return session;
	}

	function requireClientHeader(c: Context) {
		if (!c.req.header('X-Clinks-Client')) throw unauthorized();
	}

	/** The refresh token from the body (native) or the cookie (web). A custom header keeps forms of other sites out. */
	function presentedRefreshToken(c: Context, body: { refreshToken?: string }): string {
		requireClientHeader(c);
		const token = body.refreshToken ?? getCookie(c, refreshCookie);
		if (!token) throw unauthorized();
		return token;
	}

	app.openapi(
		route({
			method: 'get',
			path: '/health',
			tags: ['system'],
			responses: { 200: json(z.object({ status: z.literal('ok') })) },
		}),
		async (c) => {
			await services.db.selectFrom('users').select('id').limit(1).execute();
			return c.json({ status: 'ok' as const }, 200);
		},
	);

	app.openapi(
		route({
			method: 'get',
			path: '/.well-known/jwks.json',
			tags: ['system'],
			responses: { 200: json(z.object({ keys: z.array(z.record(z.string(), z.unknown())) })) },
		}),
		(c) => {
			c.header('Cache-Control', 'public, max-age=300');
			return c.json(services.tokens.jwks() as { keys: Record<string, unknown>[] }, 200);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/sign-up',
			tags: ['auth'],
			request: body(contract.signUpRequest),
			responses: { 201: json(contract.verificationResponse) },
		}),
		async (c) => c.json(await auth.signUp(c.req.valid('json'), caller(c)), 201),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/sign-in',
			tags: ['auth'],
			request: body(contract.signInRequest),
			responses: { 200: json(contract.signInResponse) },
		}),
		async (c) => {
			const result = await auth.signIn(c.req.valid('json'), caller(c));
			return c.json(
				result.status === 'authenticated' ? { status: result.status, session: deliver(c, result.session) } : result,
				200,
			);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/two-factor',
			tags: ['auth'],
			request: body(contract.twoFactorRequest),
			responses: { 200: json(contract.sessionResponse) },
		}),
		async (c) => c.json(deliver(c, await auth.confirmTwoFactor(c.req.valid('json'), caller(c))), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/verify-email',
			tags: ['auth'],
			request: body(contract.verifyEmailRequest),
			responses: { 200: json(contract.sessionResponse) },
		}),
		async (c) => c.json(deliver(c, await auth.verifyEmail(c.req.valid('json'), caller(c))), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/verify-email/resend',
			tags: ['auth'],
			request: body(contract.resendVerificationRequest),
			responses: { 200: json(contract.verificationResponse) },
		}),
		async (c) => c.json(await auth.resendVerification(c.req.valid('json').verificationId, caller(c)), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/password-reset/request',
			tags: ['auth'],
			request: body(contract.passwordResetRequest),
			responses: { 204: empty() },
		}),
		async (c) => {
			await auth.requestPasswordReset(c.req.valid('json').email, caller(c));
			return c.body(null, 204);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/password-reset',
			tags: ['auth'],
			request: body(contract.passwordResetConfirm),
			responses: { 204: empty() },
		}),
		async (c) => {
			await auth.resetPassword(c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/refresh',
			tags: ['auth'],
			request: body(contract.refreshRequest),
			responses: { 200: json(contract.sessionResponse) },
		}),
		async (c) => {
			const opened = await sessions
				.refresh(presentedRefreshToken(c, c.req.valid('json')), caller(c))
				.catch((error: unknown) => {
					deleteCookie(c, refreshCookie, { path: '/auth' });
					throw error;
				});
			return c.json(deliver(c, opened), 200);
		},
	);

	app.openapi(
		route({
			method: 'post',
			path: '/auth/sign-out',
			tags: ['auth'],
			request: body(contract.refreshRequest),
			responses: { 204: empty() },
		}),
		async (c) => {
			requireClientHeader(c);
			// The refresh token identifies the device even when the access token has already expired.
			const claims = await claimsOf(c);
			if (claims) await sessions.revokeFamily(claims.sub, claims.sid);
			const refreshToken = c.req.valid('json').refreshToken ?? getCookie(c, refreshCookie);
			if (refreshToken) await sessions.revokeByToken(refreshToken);
			deleteCookie(c, refreshCookie, { path: '/auth' });
			return c.body(null, 204);
		},
	);

	const me = new OpenAPIHono<Env>({
		defaultHook: validationHook,
	});
	me.use(signedIn);

	me.openapi(
		route({ method: 'get', path: '/me', tags: ['account'], responses: { 200: json(contract.meResponse) } }, true),
		async (c) => c.json(await tenants.me(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/tenant',
				tags: ['account'],
				request: body(contract.switchTenantRequest),
				responses: { 200: json(contract.sessionResponse) },
			},
			true,
		),
		async (c) => c.json(await sessions.switchTenant(c.var.claims, c.req.valid('json').tenantId), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/password',
				tags: ['account'],
				request: body(contract.changePasswordRequest),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await auth.changePassword(c.var.claims, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/two-factor/setup',
				tags: ['account'],
				responses: { 200: json(contract.twoFactorSetupResponse) },
			},
			true,
		),
		async (c) => c.json(await auth.setUpTwoFactor(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/two-factor/enable',
				tags: ['account'],
				request: body(contract.twoFactorCodeRequest),
				responses: { 200: json(contract.recoveryCodesResponse) },
			},
			true,
		),
		async (c) => c.json(await auth.enableTwoFactor(c.var.claims, c.req.valid('json').code, caller(c)), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/two-factor/disable',
				tags: ['account'],
				request: body(contract.disableTwoFactorRequest),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await auth.disableTwoFactor(c.var.claims, c.req.valid('json'), caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/me/sessions',
				tags: ['account'],
				responses: { 200: json(z.array(contract.deviceSessionDto)) },
			},
			true,
		),
		async (c) => c.json(await sessions.list(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'delete',
				path: '/me/sessions/{id}',
				tags: ['account'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await sessions.revokeFamily(c.var.claims.sub, c.req.valid('param').id);
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenants',
				tags: ['tenants'],
				request: body(contract.createTenantRequest),
				responses: { 201: json(z.object({ tenantId: z.uuid() })) },
			},
			true,
		),
		async (c) => c.json(await tenants.create(c.var.claims, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'get',
				path: '/tenant/invitations',
				tags: ['tenants'],
				responses: { 200: json(z.array(contract.invitationDto)) },
			},
			true,
		),
		async (c) => c.json(await tenants.invitations(c.var.claims), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/invitations',
				tags: ['tenants'],
				request: body(contract.inviteRequest),
				responses: { 201: json(contract.invitationDto) },
			},
			true,
		),
		async (c) => c.json(await tenants.invite(c.var.claims, c.req.valid('json'), caller(c)), 201),
	);

	me.openapi(
		route(
			{
				method: 'delete',
				path: '/tenant/invitations/{id}',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await tenants.revokeInvitation(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/sync/write',
				tags: ['sync'],
				request: body(syncWriteRequest),
				responses: { 200: json(z.object({ applied: z.number().int() })) },
			},
			true,
		),
		async (c) => c.json(await sync.write(c.var.claims, c.req.valid('json'), caller(c)), 200),
	);

	me.openapi(
		route(
			{
				method: 'post',
				path: '/sync/import',
				tags: ['sync'],
				request: body(syncImportRequest),
				responses: { 200: json(z.object({ applied: z.number().int() })) },
			},
			true,
		),
		async (c) => c.json(await sync.write(c.var.claims, c.req.valid('json'), caller(c), 'import'), 200),
	);

	const settings = new SettingsService(services);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/invitations/{id}/resend',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await tenants.resend(c.var.claims, c.req.valid('param').id, caller(c));
			return c.body(null, 204);
		},
	);
	me.openapi(
		route(
			{ method: 'get', path: '/tenant/team', tags: ['tenants'], responses: { 200: json(contract.teamResponse) } },
			true,
		),
		async (c) => c.json(await settings.team(c.var.claims), 200),
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/roles',
				tags: ['tenants'],
				request: body(contract.roleUpdate),
				responses: { 200: json(z.object({ id: z.uuid() })) },
			},
			true,
		),
		async (c) => c.json(await settings.saveRole(c.var.claims, c.req.valid('json')), 200),
	);
	me.openapi(
		route(
			{
				method: 'delete',
				path: '/tenant/roles/{id}',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.role(c.var.claims, c.req.valid('param').id);
			return c.body(null, 204);
		},
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/members/{id}',
				tags: ['tenants'],
				request: { params: z.object({ id: z.uuid() }), ...body(contract.memberUpdate) },
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.member(c.var.claims, c.req.valid('param').id, c.req.valid('json'));
			return c.body(null, 204);
		},
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/settings',
				tags: ['tenants'],
				request: body(contract.companyUpdate),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.company(c.var.claims, c.req.valid('json'));
			return c.body(null, 204);
		},
	);
	const storage = new StorageService(services);
	me.openapi(
		route(
			{
				method: 'get',
				path: '/tenant/storage',
				tags: ['tenants'],
				responses: { 200: json(contract.storageView.nullable()) },
			},
			true,
		),
		async (c) => c.json(await storage.get(c.var.claims), 200),
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/storage',
				tags: ['tenants'],
				request: body(contract.storageInput),
				responses: { 200: json(contract.storageView.nullable()) },
			},
			true,
		),
		async (c) => c.json(await storage.save(c.var.claims, c.req.valid('json')), 200),
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/tenant/storage/test',
				tags: ['tenants'],
				responses: { 200: json(contract.storageCheck) },
			},
			true,
		),
		async (c) => c.json(await storage.test(c.var.claims), 200),
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/me/profile',
				tags: ['account'],
				request: body(contract.profileUpdate),
				responses: { 204: empty() },
			},
			true,
		),
		async (c) => {
			await settings.profile(c.var.claims, c.req.valid('json'));
			return c.body(null, 204);
		},
	);
	const billing = new BillingService(services);
	app.post('/webhooks/stripe', async (c) => {
		await billing.webhook(await c.req.text(), c.req.header('Stripe-Signature') ?? '');
		return c.body(null, 204);
	});
	me.openapi(
		route(
			{
				method: 'post',
				path: '/billing/checkout',
				tags: ['billing'],
				request: body(checkoutRequest),
				responses: { 200: json(z.object({ url: z.url() })) },
			},
			true,
		),
		async (c) => c.json(await billing.open(c.var.claims, c.req.valid('json')), 200),
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: '/billing/portal',
				tags: ['billing'],
				responses: { 200: json(z.object({ url: z.url() })) },
			},
			true,
		),
		async (c) => c.json(await billing.open(c.var.claims), 200),
	);
	const files = new FileService(services);
	const documentParams = z.object({ doc: z.uuid() });
	const versionParams = documentParams.extend({ id: z.uuid() });
	const versions = '/documents/{doc}/versions';
	me.openapi(
		route(
			{
				method: 'get',
				path: versions,
				tags: ['files'],
				request: { params: documentParams },
				responses: {
					200: json(
						z.array(z.object({ id: z.uuid(), size: z.int(), mimeType: z.string(), createdAt: z.iso.datetime() })),
					),
				},
			},
			true,
		),
		async (c) =>
			c.json(
				(await files.list(c.var.claims, c.req.valid('param').doc)).map((row) => ({
					...row,
					createdAt: row.createdAt.toISOString(),
				})),
				200,
			),
	);
	me.openapi(
		route(
			{
				method: 'get',
				path: versions + '/{id}/download',
				tags: ['files'],
				request: { params: versionParams },
				responses: { 200: json(z.object({ url: z.url() })) },
			},
			true,
		),
		async (c) => {
			const { doc, id } = c.req.valid('param');
			c.header('Cache-Control', 'no-store');
			return c.json(await files.download(c.var.claims, doc, id), 200);
		},
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: versions + '/upload',
				tags: ['files'],
				request: { params: documentParams, ...body(versionUpload) },
				responses: { 200: json(z.object({ id: z.uuid(), url: z.url() })) },
			},
			true,
		),
		async (c) => c.json(await files.upload(c.var.claims, c.req.valid('param').doc, c.req.valid('json')), 200),
	);
	me.openapi(
		route(
			{
				method: 'post',
				path: versions + '/{id}/commit',
				tags: ['files'],
				request: { params: versionParams, ...body(z.object({ restoreFrom: z.uuid().optional() })) },
				responses: { 200: json(z.object({ id: z.uuid() })) },
			},
			true,
		),
		async (c) => {
			const { doc, id } = c.req.valid('param');
			return c.json(await files.commit(c.var.claims, doc, id, c.req.valid('json').restoreFrom), 200);
		},
	);

	const invitationToken = z.object({ token: z.string().min(20).max(200) });

	app.openapi(
		route({
			method: 'get',
			path: '/invitations/{token}',
			tags: ['tenants'],
			request: { params: invitationToken },
			responses: { 200: json(contract.invitationDetailsResponse) },
		}),
		async (c) => c.json(await tenants.invitationDetails(c.req.valid('param').token), 200),
	);

	app.openapi(
		route({
			method: 'post',
			path: '/invitations/{token}/accept',
			tags: ['tenants'],
			request: { params: invitationToken, ...body(contract.acceptInvitationRequest) },
			responses: { 200: json(contract.acceptInvitationResponse) },
		}),
		async (c) => {
			const result = await tenants.acceptInvitation(
				c.req.valid('param').token,
				c.req.valid('json'),
				await claimsOf(c),
				caller(c),
			);
			return c.json(
				{ tenantId: result.tenantId, session: result.session ? deliver(c, result.session) : undefined },
				200,
			);
		},
	);

	app.route('/', me);

	app.doc31('/openapi.json', {
		openapi: '3.1.0',
		info: { title: 'CLinks API', version: '0.1.0' },
	});
	app.openAPIRegistry.registerComponent('securitySchemes', 'bearer', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
	});

	return app;
}

/** A route with the error responses every route can give; `secured` routes also need a bearer token. */
function route<const R extends RouteConfig>(config: R, secured = false) {
	const errors = {
		400: json(contract.errorResponse, 'Validation failed'),
		...(secured
			? { 401: json(contract.errorResponse, 'Not signed in'), 403: json(contract.errorResponse, 'Not allowed') }
			: {}),
	};
	return createRoute({
		...config,
		responses: { ...config.responses, ...errors },
		security: secured ? [{ bearer: [] }] : [],
	});
}

function validationHook(result: { success: boolean; error?: ZodError }) {
	if (!result.success && result.error) raiseValidation(result.error);
}

function json<T extends ZodType>(schema: T, description = 'OK') {
	return { content: { 'application/json': { schema } }, description };
}

function body<T extends ZodType>(schema: T) {
	return { body: { content: { 'application/json': { schema } }, required: true } };
}

function empty() {
	return { description: 'No content' };
}

function errorBody(
	locale: ReturnType<typeof pickLocale>,
	key: ProductTranslationKey,
	fields: { [field: string]: ProductTranslationKey } = {},
): contract.ErrorResponse {
	const localized = Object.fromEntries(
		Object.entries(fields).map(([field, fieldKey]) => [field, translate(locale, fieldKey)]),
	);
	return {
		error: {
			code: key,
			message: translate(locale, key),
			...(Object.keys(localized).length ? { fields: localized } : {}),
		},
	};
}

/** Maps Zod issues to the catalog's field messages. */
function raiseValidation(error: ZodError): never {
	const fields: { [field: string]: ProductTranslationKey } = {};
	for (const issue of error.issues) {
		const field = issue.path.join('.') || 'body';
		if (fields[field]) continue;
		fields[field] =
			field === 'email'
				? 'error.ws.invalid_email'
				: field.toLowerCase().includes('password') && issue.code === 'too_small'
					? 'error.ws.password_too_short'
					: field === 'code'
						? 'error.ws.invalid_code'
						: 'error.ws.required';
	}
	throw new ApiError(400, 'error.validation', fields);
}
