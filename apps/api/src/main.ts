import Stripe from 'stripe';
import { priceBook } from './services/billing.ts';
import { ObjectStore } from './object-store.ts';
import { SecretBox } from './crypto.ts';
import { createDb } from '@clinks/db/client';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { smtpMailer } from './mailer.ts';
import { RateLimiter } from './rate-limit.ts';
import { TokenService } from './tokens.ts';

const config = loadConfig();
const billing = config.STRIPE_SECRET_KEY
	? {
			stripe: new Stripe(config.STRIPE_SECRET_KEY, { timeout: 10000 }),
			secret: config.STRIPE_WEBHOOK_SECRET ?? '',
			prices: priceBook.parse(JSON.parse(config.STRIPE_PRICES ?? '{}')),
			tax: config.STRIPE_TAX,
		}
	: undefined;
if (billing && !billing.secret) throw new Error('STRIPE_WEBHOOK_SECRET is required when billing is enabled');
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
		billing,
		db,
		objects: config.S3_BUCKET
			? new ObjectStore({ bucket: config.S3_BUCKET, endpoint: config.S3_ENDPOINT, region: config.S3_REGION })
			: undefined,
		secrets: config.STORAGE_SECRET_KEY ? SecretBox.fromBase64(config.STORAGE_SECRET_KEY) : SecretBox.ephemeral(),
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
