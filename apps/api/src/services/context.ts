import type { Billing } from './billing.ts';
import type { ObjectStore } from '../object-store.ts';
import type { SecretBox } from '../crypto.ts';
import type { ResolveHost } from '../endpoint-guard.ts';
import type { Db } from '@clinks/db/client';
import type { Config } from '../config.ts';
import type { Mailer } from '../mailer.ts';
import type { RateLimiter } from '../rate-limit.ts';
import type { TokenService } from '../tokens.ts';

/** Everything the services need, built once in main.ts (or per test). */
export interface Services {
	db: Db;
	/** CLinks storage; tenants may bring their own bucket instead (see TenantStores). */
	objects?: ObjectStore;
	/** Encrypts tenants' own S3 secrets. */
	secrets: SecretBox;
	/** DNS for the SSRF check on tenants' S3 endpoints; tests pass a fixed table. */
	resolveHost?: ResolveHost;
	billing?: Billing;
	tokens: TokenService;
	mailer: Mailer;
	/** Sends from workspaces' own verified domains (SMTP_RELAY_URL); without it they use the platform sender. */
	relay?: Mailer;
	/** DNS TXT lookup for sender domains; tests pass a fixed table. */
	resolveTxt?: (host: string) => Promise<string[][]>;
	limiter: RateLimiter;
	config: Pick<Config, 'WEB_ORIGIN'> & Partial<Pick<Config, 'STORAGE_ALLOW_INTERNAL' | 'MAIL_SPF_INCLUDE'>>;
	now: () => Date;
}

/** Who calls and from where; recorded with sessions and audit entries. */
export interface Caller {
	ip: string | null;
	device: string;
	locale: 'de-CH' | 'en-US';
}
