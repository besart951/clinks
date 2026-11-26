import * as contract from '@clinks/contracts/auth';
import { getConnInfo } from '@hono/node-server/conninfo';
import { createRoute, OpenAPIHono, type RouteConfig } from '@hono/zod-openapi';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { ZodError, ZodType } from 'zod';
import { ApiError, unauthorized } from '../errors.ts';
import { pickLocale, translate } from '../i18n.ts';
import type { AuthService } from '../services/auth.ts';
import type { BankImportService } from '../services/bank-imports.ts';
import type { BillingService } from '../services/billing.ts';
import type { Caller, Services } from '../services/context.ts';
import type { FileService } from '../services/files.ts';
import type { InvoiceService } from '../services/invoices.ts';
import type { OpenedSession, SessionService } from '../services/sessions.ts';
import type { SettingsService } from '../services/settings.ts';
import type { StorageService } from '../services/storage.ts';
import type { SyncService } from '../services/sync.ts';
import type { TenantService } from '../services/tenants.ts';
import type { AccessClaims } from '../tokens.ts';

export type Env = { Variables: { claims: AccessClaims } };
export type Router = OpenAPIHono<Env>;

export const refreshCookie = 'clinks_refresh';
const refreshCookieSeconds = 30 * 24 * 60 * 60;

export interface RouteDeps {
	services: Services;
	sessions: SessionService;
	auth: AuthService;
	tenants: TenantService;
	settings: SettingsService;
	storage: StorageService;
	billing: BillingService;
	files: FileService;
	invoices: InvoiceService;
	bankImports: BankImportService;
	sync: SyncService;
	caller: (c: Context) => Caller;
	deliver: (c: Context, opened: OpenedSession) => contract.SessionResponse;
	claims: (c: Context) => Promise<AccessClaims | null>;
}

export async function claimsOf(c: Context, services: Services, sessions: SessionService): Promise<AccessClaims | null> {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) return null;
	const claims = await services.tokens.verify(header.slice(7), services.now()).catch(() => null);
	return claims && (await sessions.isActive(claims)) ? claims : null;
}

export function callerOf(c: Context, trustProxy: boolean): Caller {
	// The last entry is the one Caddy appended; earlier ones come from the client and can be made up.
	const forwarded = trustProxy ? c.req.header('X-Forwarded-For')?.split(',').at(-1)?.trim() : undefined;
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
export function deliverSession(c: Context, opened: OpenedSession, cookieSecure: boolean): contract.SessionResponse {
	const session = { accessToken: opened.accessToken, expiresAt: opened.expiresAt };
	if (c.req.header('X-Clinks-Client') === 'native') return { ...session, refreshToken: opened.refreshToken };
	setCookie(c, refreshCookie, opened.refreshToken, {
		httpOnly: true,
		secure: cookieSecure,
		sameSite: 'Strict',
		path: '/auth',
		maxAge: refreshCookieSeconds,
	});
	return session;
}

export function requireClientHeader(c: Context) {
	if (!c.req.header('X-Clinks-Client')) throw unauthorized();
}

/** The refresh token from the body (native) or the cookie (web). A custom header keeps forms of other sites out. */
export function presentedRefreshToken(c: Context, bodyInput: { refreshToken?: string }): string {
	requireClientHeader(c);
	const token = bodyInput.refreshToken ?? getCookie(c, refreshCookie);
	if (!token) throw unauthorized();
	return token;
}

export function clearRefreshCookie(c: Context) {
	deleteCookie(c, refreshCookie, { path: '/auth' });
}

/** A route with the error responses every route can give; `secured` routes also need a bearer token. */
export function route<const R extends RouteConfig>(config: R, secured = false) {
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

export function validationHook(result: { success: boolean; error?: ZodError }) {
	if (!result.success && result.error) raiseValidation(result.error);
}

export function json<T extends ZodType>(schema: T, description = 'OK') {
	return { content: { 'application/json': { schema } }, description };
}

export function body<T extends ZodType>(schema: T) {
	return { body: { content: { 'application/json': { schema } }, required: true } };
}

export function empty() {
	return { description: 'No content' };
}

export function errorBody(
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
