import { z } from 'zod';

const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const originList = z
	.string()
	.default('')
	.transform((value) =>
		value
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean),
	)
	.pipe(z.array(z.url()));

const environment = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().default(8787),
	/** The API's login role: no owner, no superuser, so row-level security applies. */
	DATABASE_URL: z.url().default('postgres://clinks_api:clinks-api-dev@localhost:5432/clinks'),
	/** The SPA's origin: allowed for CORS and used in links in mails. */
	WEB_ORIGIN: z.url().default('http://localhost:5176'),
	/** The API's public HTTPS origin, for links mail apps call directly (one-click unsubscribe). */
	API_ORIGIN: z.url().default('http://localhost:8787'),
	/** Optional comma-separated extra origins allowed for CORS (e.g. desktop app origin). */
	ALLOWED_ORIGINS: originList,
	/** Issuer of access tokens; PowerSync and Hocuspocus check it. */
	TOKEN_ISSUER: z.string().default('http://localhost:8787'),
	TOKEN_AUDIENCE: z.string().default('clinks'),
	/** Private Ed25519 JWK (JSON). Without it a key is generated at start-up, outside production only. */
	SIGNING_KEY: z.string().optional(),
	/** Public JWKs of keys being rotated out (JSON array), still accepted until their tokens expire. */
	PREVIOUS_PUBLIC_KEYS: z.string().default('[]'),
	STRIPE_SECRET_KEY: z.string().min(1).optional(),
	STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
	STRIPE_PRICES: z.string().optional(),
	STRIPE_TAX: boolean.default(false),
	S3_ENDPOINT: z.url().optional(),
	S3_BUCKET: z.string().min(1).optional(),
	S3_REGION: z.string().default('us-east-1'),
	/** 32 random bytes (base64) that encrypt tenants' own S3 secrets. Generated per start outside production. */
	STORAGE_SECRET_KEY: z.string().optional(),
	/** Development only: lets tenants point their storage at internal hosts such as the local RustFS. */
	STORAGE_ALLOW_INTERNAL: boolean.default(false),
	SMTP_URL: z.string().default('smtp://localhost:1025'),
	MAIL_FROM: z.string().default('CLinks <no-reply@clinks.ch>'),
	/** SMTP relay for mail from workspaces' own verified domains; CLinks signs DKIM itself. Without it they fall back to MAIL_FROM. */
	SMTP_RELAY_URL: z.string().optional(),
	/** The SPF include workspaces publish; CLinks points it at the relay, so a new provider needs no customer change. */
	MAIL_SPF_INCLUDE: z.string().default('_spf.clinks.ch'),
	/** Domain of the catch-all mailbox for filing addresses and bounces (Return-Path); empty turns both off. */
	INBOUND_DOMAIN: z.string().default('in.clinks.ch'),
	/** The catch-all mailbox, `imaps://user:password@host:993`; without it nothing is read (development: Mailpit). */
	INBOUND_IMAP_URL: z.string().optional(),
	/** Development: read inbound mail from Mailpit's API instead of IMAP. */
	INBOUND_MAILPIT_URL: z.url().optional(),
	/** Sends the outbox from this process; on exactly one instance in production. */
	MAIL_WORKER: boolean.default(true),
	/** Upper bound for the outbox, across workspaces; the mail provider's limit decides. */
	MAIL_RATE_PER_SECOND: z.coerce.number().positive().default(5),
	/** Personal and business mails a workspace may send per day from the mail module (not invoices, not newsletters). */
	MAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(500),
	/** Secure cookies need HTTPS; browsers treat http://localhost as secure too. */
	COOKIE_SECURE: boolean.default(true),
	/** Behind Caddy the client address comes from X-Forwarded-For. */
	TRUST_PROXY: boolean.default(false),
});

export type Config = z.infer<typeof environment>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
	// An empty line such as `STRIPE_SECRET_KEY=` in an env file means "not set", not an empty value.
	const set = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
	const config = environment.parse(set);
	if (config.NODE_ENV === 'production' && !config.SIGNING_KEY) throw new Error('SIGNING_KEY is required in production');
	if (config.NODE_ENV === 'production' && config.STORAGE_ALLOW_INTERNAL)
		throw new Error('STORAGE_ALLOW_INTERNAL must stay off in production');
	if (config.NODE_ENV === 'production' && !config.STORAGE_SECRET_KEY)
		throw new Error('STORAGE_SECRET_KEY is required in production');
	if (config.NODE_ENV === 'production' && (!config.S3_BUCKET || !config.S3_ENDPOINT))
		throw new Error('A private versioned S3 bucket and endpoint are required in production');
	return config;
}
