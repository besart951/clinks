import { createDb } from '@clinks/db/client';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { smtpMailer } from './mailer.ts';
import { RateLimiter } from './rate-limit.ts';
import { TokenService } from './tokens.ts';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const tokens = await TokenService.create({
	issuer: config.TOKEN_ISSUER,
	audience: config.TOKEN_AUDIENCE,
	signingKey: config.SIGNING_KEY,
	previousPublicKeys: config.PREVIOUS_PUBLIC_KEYS,
});
if (!config.SIGNING_KEY) console.warn('No SIGNING_KEY: using a key that lasts until restart (development only).');

const app = createApp({
	services: {
		db,
		tokens,
		mailer: smtpMailer(config.SMTP_URL, config.MAIL_FROM),
		limiter: new RateLimiter(),
		config,
		now: () => new Date(),
	},
	config,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) =>
	console.log(`CLinks API on http://localhost:${info.port}`),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		server.close();
		void db.destroy();
	});
}
