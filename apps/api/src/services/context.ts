import type { Db } from '@clinks/db/client';
import type { Config } from '../config.ts';
import type { Mailer } from '../mailer.ts';
import type { RateLimiter } from '../rate-limit.ts';
import type { TokenService } from '../tokens.ts';

/** Everything the services need, built once in main.ts (or per test). */
export interface Services {
	db: Db;
	tokens: TokenService;
	mailer: Mailer;
	limiter: RateLimiter;
	config: Pick<Config, 'WEB_ORIGIN'>;
	now: () => Date;
}

/** Who calls and from where; recorded with sessions and audit entries. */
export interface Caller {
	ip: string | null;
	device: string;
	locale: 'de-CH' | 'en-US';
}
