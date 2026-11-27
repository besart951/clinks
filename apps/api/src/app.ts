import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import type { Config } from './config.ts';
import { ApiError, unauthorized } from './errors.ts';
import { pickLocale } from './i18n.ts';
import { registerAccountRoutes } from './routes/account.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerBillingRoutes } from './routes/billing.ts';
import { registerFileRoutes } from './routes/files.ts';
import { registerFinanceRoutes } from './routes/finance.ts';
import { registerMailRoutes } from './routes/mail.ts';
import { registerSyncRoutes } from './routes/sync.ts';
import {
	callerOf,
	claimsOf,
	deliverSession,
	errorBody,
	validationHook,
	type Env,
	type RouteDeps,
} from './routes/helpers.ts';
import { AuthService } from './services/auth.ts';
import { BillingService } from './services/billing.ts';
import type { Services } from './services/context.ts';
import { FileService } from './services/files.ts';
import { BankImportService } from './services/bank-imports.ts';
import { MailSettingsService } from './services/mail-settings.ts';
import { MailComposeService } from './services/mail-compose.ts';
import { InvoiceService } from './services/invoices.ts';
import { InvoiceLinks } from './services/invoice-links.ts';
import { SessionService } from './services/sessions.ts';
import { SettingsService } from './services/settings.ts';
import { StorageService } from './services/storage.ts';
import { SyncService } from './services/sync.ts';
import { TenantService } from './services/tenants.ts';

export interface AppOptions {
	services: Services;
	config: Pick<Config, 'WEB_ORIGIN' | 'COOKIE_SECURE' | 'TRUST_PROXY'> & Partial<Pick<Config, 'ALLOWED_ORIGINS'>>;
}

export function createApp({ services, config }: AppOptions) {
	const sessions = new SessionService(services);
	const deps: RouteDeps = {
		services,
		sessions,
		auth: new AuthService(services, sessions),
		tenants: new TenantService(services, sessions),
		settings: new SettingsService(services),
		storage: new StorageService(services),
		billing: new BillingService(services),
		files: new FileService(services),
		invoices: new InvoiceService(services),
		invoiceLinks: new InvoiceLinks(services),
		bankImports: new BankImportService(services),
		mailSettings: new MailSettingsService(services),
		mailCompose: new MailComposeService(services),
		sync: new SyncService(services),
		caller: (c) => callerOf(c, config.TRUST_PROXY),
		deliver: (c, opened) => deliverSession(c, opened, config.COOKIE_SECURE),
		claims: (c) => claimsOf(c, services, sessions),
	};
	const app = new OpenAPIHono<Env>({ defaultHook: validationHook });
	const allowedOrigins = new Set([config.WEB_ORIGIN, ...(config.ALLOWED_ORIGINS ?? [])]);

	app.use(secureHeaders());
	app.use(
		cors({
			origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
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
	const bankFileLimit = limit(6 * 1024 * 1024); // A month of camt.054 notifications, as text in JSON.
	app.use((c, next) => {
		if (c.req.path === '/sync/import') return importLimit(c, next);
		if (c.req.path === '/finance/bank-imports') return bankFileLimit(c, next);
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
		const claims = await deps.claims(c);
		if (!claims) throw unauthorized();
		c.set('claims', claims);
		await next();
	});

	const me = new OpenAPIHono<Env>({ defaultHook: validationHook });
	me.use(signedIn);

	registerAuthRoutes(app, deps);
	registerAccountRoutes(app, me, deps);
	registerSyncRoutes(me, deps);
	registerBillingRoutes(app, me, deps);
	registerFileRoutes(me, deps);
	registerFinanceRoutes(app, me, deps);
	registerMailRoutes(me, deps);

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
