import { z } from 'zod';

const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');

const environment = z.object({
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().default(8787),
	/** The API's login role: no owner, no superuser, so row-level security applies. */
	DATABASE_URL: z.url().default('postgres://clinks_api:clinks-api-dev@localhost:5432/clinks'),
	/** The SPA's origin: allowed for CORS and used in links in mails. */
	WEB_ORIGIN: z.url().default('http://localhost:5176'),
	/** Issuer of access tokens; PowerSync and Hocuspocus check it. */
	TOKEN_ISSUER: z.string().default('http://localhost:8787'),
	TOKEN_AUDIENCE: z.string().default('clinks'),
	/** Private Ed25519 JWK (JSON). Without it a key is generated at start-up, outside production only. */
	SIGNING_KEY: z.string().optional(),
	/** Public JWKs of keys being rotated out (JSON array), still accepted until their tokens expire. */
	PREVIOUS_PUBLIC_KEYS: z.string().default('[]'),
	SMTP_URL: z.string().default('smtp://localhost:1025'),
	MAIL_FROM: z.string().default('CLinks <no-reply@clinks.ch>'),
	/** Secure cookies need HTTPS; browsers treat http://localhost as secure too. */
	COOKIE_SECURE: boolean.default(true),
	/** Behind Caddy the client address comes from X-Forwarded-For. */
	TRUST_PROXY: boolean.default(false),
});

export type Config = z.infer<typeof environment>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
	const config = environment.parse(source);
	if (config.NODE_ENV === 'production' && !config.SIGNING_KEY) throw new Error('SIGNING_KEY is required in production');
	return config;
}
