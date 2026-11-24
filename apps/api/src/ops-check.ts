/**
 * Preflight before go-live: checks the private environment files of a deployment, then (unless --offline) the
 * services they point to. Messages are German, for the operator. Exit status 1 when anything must be fixed.
 *
 *   pnpm ops:check -- --config-dir /etc/clinks [--offline]
 */
import { GetObjectLockConfigurationCommand } from '@aws-sdk/client-s3';
import { createDb } from '@clinks/db/client';
import { sql } from 'kysely';
import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import Stripe from 'stripe';
import { ZodError } from 'zod';
import { loadConfig } from './config.ts';
import { ObjectStore } from './object-store.ts';

export type Status = 'ok' | 'warn' | 'fail';
export interface Check {
	group: string;
	status: Status;
	text: string;
	/** What to do about it. */
	hint?: string;
}
export interface EnvFiles {
	api: Record<string, string | undefined>;
	collab: Record<string, string | undefined>;
	powersync: Record<string, string | undefined>;
}

const files = ['api', 'collab', 'powersync'] as const;

export async function readEnvFiles(dir: string): Promise<{ env: EnvFiles; missing: string[] }> {
	const env = { api: {}, collab: {}, powersync: {} } as EnvFiles;
	const missing: string[] = [];
	for (const name of files) {
		try {
			env[name] = parseEnv(await readFile(join(dir, `${name}.env`), 'utf8'));
		} catch {
			missing.push(`${name}.env`);
		}
	}
	return { env, missing };
}

const isHttps = (value: string | undefined) => {
	try {
		return new URL(value ?? '').protocol === 'https:';
	} catch {
		return false;
	}
};

/** Checks that need no network: presence, formats and that the three files agree. */
export function configChecks({ api, collab, powersync }: EnvFiles): Check[] {
	const checks: Check[] = [];
	const add = (group: string, ok: boolean | Status, text: string, hint?: string) =>
		checks.push({ group, status: ok === true ? 'ok' : ok === false ? 'fail' : ok, text, ...(ok !== true && { hint }) });

	const g = 'Konfiguration api.env';
	try {
		loadConfig({ ...api, NODE_ENV: 'production' });
		add(g, true, 'Pflichtwerte für den Produktionsstart vorhanden');
	} catch (error) {
		const issues =
			error instanceof ZodError ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) : [];
		add(
			g,
			false,
			'API würde nicht starten',
			issues.length ? issues.join('; ') : error instanceof Error ? error.message : String(error),
		);
	}
	try {
		const jwk = JSON.parse(api.SIGNING_KEY ?? '');
		// Ed25519 keys are 32 bytes: 43 characters in base64url.
		add(
			g,
			Boolean(jwk.kid && jwk.crv === 'Ed25519' && jwk.d?.length === 43 && jwk.x?.length === 43),
			'SIGNING_KEY ist ein privater Ed25519-Schlüssel mit kid',
			'Mit `pnpm --filter @clinks/api keys` erzeugen.',
		);
	} catch {
		add(
			g,
			false,
			'SIGNING_KEY ist kein JSON-Schlüssel',
			'Mit `pnpm --filter @clinks/api keys` erzeugen und in einfache Anführungszeichen setzen.',
		);
	}
	add(
		g,
		Buffer.from(api.STORAGE_SECRET_KEY ?? '', 'base64').length === 32,
		'STORAGE_SECRET_KEY hat 32 Byte',
		'Mit `pnpm --filter @clinks/api keys` erzeugen. Später nicht mehr ändern: gespeicherte Mandanten-Schlüssel würden unlesbar.',
	);
	for (const key of ['WEB_ORIGIN', 'TOKEN_ISSUER', 'S3_ENDPOINT'] as const)
		add(g, isHttps(api[key]), `${key} verwendet HTTPS`, 'Öffentliche https://-Adresse eintragen.');
	add(
		g,
		Boolean(api.AWS_ACCESS_KEY_ID && api.AWS_SECRET_ACCESS_KEY),
		'Zugangsdaten für den Dokumenten-Bucket gesetzt',
		'AWS_ACCESS_KEY_ID und AWS_SECRET_ACCESS_KEY (EC2-Zugangsdaten von Infomaniak) eintragen.',
	);
	const user = (() => {
		try {
			return decodeURIComponent(new URL(api.DATABASE_URL ?? '').username);
		} catch {
			return '';
		}
	})();
	add(
		g,
		user === 'clinks_api',
		'API verbindet sich als clinks_api, nicht als Eigentümer',
		'DATABASE_URL auf das Login clinks_api stellen (ohne Superuser, ohne BYPASSRLS).',
	);
	add(
		g,
		api.SMTP_URL?.startsWith('smtps://') || api.SMTP_URL?.includes('secure=true') ? true : 'warn',
		'SMTP mit TLS',
		'smtps://…:465 verwenden, damit Codes und Links verschlüsselt verschickt werden.',
	);

	const b = 'Zahlungen (Stripe)';
	const stripeKey = api.STRIPE_SECRET_KEY ?? '';
	if (!stripeKey)
		add(
			b,
			'warn',
			'Stripe nicht eingerichtet: Abos können nicht gebucht werden',
			'STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET und STRIPE_PRICES setzen.',
		);
	else {
		add(
			b,
			stripeKey.startsWith('sk_live_') ? true : 'warn',
			stripeKey.startsWith('sk_live_') ? 'Live-Schlüssel' : 'Testmodus-Schlüssel (sk_test_)',
			'Für echte Zahlungen den Live-Schlüssel eintragen.',
		);
		add(
			b,
			Boolean(api.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')),
			'Webhook-Secret gesetzt',
			'Im Stripe-Dashboard den Endpoint …/webhooks/stripe anlegen und dessen Secret eintragen.',
		);
		let prices = false;
		try {
			prices = Object.keys(JSON.parse(api.STRIPE_PRICES ?? '')).length > 0;
		} catch {
			/* reported below */
		}
		add(b, prices, 'STRIPE_PRICES enthält die Preise', 'Ausgabe von `node apps/api/src/billing-catalog.ts` eintragen.');
	}

	const c = 'Konfiguration collab.env';
	add(c, Boolean(collab.DATABASE_URL), 'DATABASE_URL gesetzt', 'Dasselbe eingeschränkte Login wie die API verwenden.');
	add(
		c,
		collab.TOKEN_ISSUER === api.TOKEN_ISSUER && collab.TOKEN_AUDIENCE === (api.TOKEN_AUDIENCE ?? 'clinks'),
		'TOKEN_ISSUER und TOKEN_AUDIENCE wie in api.env',
		'Beide Werte aus api.env übernehmen.',
	);
	const jwks = `${(api.TOKEN_ISSUER ?? '').replace(/\/$/, '')}/.well-known/jwks.json`;
	add(c, collab.JWKS_URL === jwks, 'JWKS_URL zeigt auf die öffentliche API', `JWKS_URL=${jwks}`);

	const p = 'Konfiguration powersync.env';
	add(
		p,
		Boolean(powersync.PS_DATA_SOURCE_URI) && powersync.PS_DATA_SOURCE_URI !== api.DATABASE_URL,
		'Eigenes Replikations-Login',
		'PS_DATA_SOURCE_URI mit einem eigenen Replikations-Login (nur SELECT auf die publizierten Tabellen).',
	);
	add(
		p,
		Boolean(powersync.PS_STORAGE_SOURCE_URI),
		'Metadaten-Datenbank gesetzt',
		'PS_STORAGE_SOURCE_URI auf eine eigene, beschreibbare Datenbank stellen.',
	);
	add(p, powersync.PS_JWKS_URI === jwks, 'PS_JWKS_URI zeigt auf die öffentliche API', `PS_JWKS_URI=${jwks}`);
	add(
		p,
		(powersync.PS_ADMIN_TOKEN ?? '').length >= 32,
		'PS_ADMIN_TOKEN ist lang genug',
		'Zufällig erzeugen, z. B. `openssl rand -hex 32`.',
	);
	return checks;
}

const problemText: Record<string, string> = {
	unreachable: 'Bucket nicht erreichbar',
	credentials: 'Zugangsdaten werden abgelehnt',
	bucket: 'Bucket existiert nicht',
	versioning: 'Versionierung ist aus',
	write: 'Schreiben, Lesen oder Löschen schlägt fehl',
	cors: 'CORS erlaubt dem Browser keine Uploads von WEB_ORIGIN',
	secret: 'Schlüssel nicht lesbar',
};

async function attempt(
	checks: Check[],
	group: string,
	text: string,
	work: () => Promise<boolean | string>,
	hint: string,
) {
	try {
		const result = await work();
		checks.push(
			result === true
				? { group, status: 'ok', text }
				: { group, status: 'fail', text, hint: typeof result === 'string' ? result : hint },
		);
	} catch (error) {
		checks.push({
			group,
			status: 'fail',
			text,
			hint: `${hint} (${error instanceof Error ? error.message : String(error)})`,
		});
	}
}

/** Talks to the database, bucket, mail server, Stripe and — once deployed — the public endpoints. */
export async function connectionChecks({ api, powersync }: EnvFiles): Promise<Check[]> {
	const checks: Check[] = [];
	const d = 'Datenbank';
	if (api.DATABASE_URL) {
		const db = createDb(api.DATABASE_URL, { max: 1 });
		await attempt(
			checks,
			d,
			'Verbindung als API-Login',
			async () => {
				const { rows } = await sql<{ superuser: boolean; bypass: boolean; member: boolean }>`
				SELECT rolsuper AS superuser, rolbypassrls AS bypass, pg_has_role(current_user, 'clinks_app', 'member') AS member
				FROM pg_roles WHERE rolname = current_user`.execute(db);
				const role = rows[0];
				if (!role?.member) return 'Login ist nicht Mitglied von clinks_app.';
				if (role.superuser || role.bypass) return 'Login darf RLS umgehen (Superuser oder BYPASSRLS) — entziehen.';
				return true;
			},
			'DATABASE_URL, Netzwerk und TLS prüfen.',
		);
		await attempt(
			checks,
			d,
			'Migrationen eingespielt',
			async () => {
				const { rows } = await sql<{ name: string }>`SELECT to_regclass('auth.storage_configs')::text AS name`.execute(
					db,
				);
				return rows[0]?.name ? true : 'Mit dem Eigentümer-Login `pnpm db:migrate` ausführen.';
			},
			'Mit dem Eigentümer-Login `pnpm db:migrate` ausführen.',
		);
		await attempt(
			checks,
			d,
			'Logische Replikation aktiv (wal_level=logical)',
			async () => {
				const { rows } = await sql<{ wal: string }>`SELECT current_setting('wal_level') AS wal`.execute(db);
				return (
					rows[0]?.wal === 'logical' || 'Beim Anbieter logische Replikation aktivieren (Voraussetzung für PowerSync).'
				);
			},
			'Beim Anbieter logische Replikation aktivieren.',
		);
		await attempt(
			checks,
			d,
			'Publikation für PowerSync vorhanden',
			async () => {
				const { rows } = await sql<{
					n: number;
				}>`SELECT count(*)::int AS n FROM pg_publication WHERE pubname = 'powersync'`.execute(db);
				return rows[0]?.n === 1 || 'Publikation `powersync` fehlt — Migrationen mit dem Eigentümer einspielen.';
			},
			'Migrationen prüfen.',
		);
		await db.destroy();
	}
	if (powersync.PS_DATA_SOURCE_URI) {
		const replication = createDb(powersync.PS_DATA_SOURCE_URI, { max: 1 });
		await attempt(
			checks,
			d,
			'Replikations-Login für PowerSync',
			async () => {
				const { rows } = await sql<{
					replication: boolean;
				}>`SELECT rolreplication AS replication FROM pg_roles WHERE rolname = current_user`.execute(replication);
				return (
					rows[0]?.replication || 'Dem Login das Recht REPLICATION geben (beim verwalteten Postgres über den Anbieter).'
				);
			},
			'PS_DATA_SOURCE_URI prüfen.',
		);
		await replication.destroy();
	}

	const s = 'Dokumenten-Bucket';
	if (api.S3_BUCKET && api.S3_ENDPOINT && api.AWS_ACCESS_KEY_ID && api.AWS_SECRET_ACCESS_KEY) {
		const store = new ObjectStore({
			bucket: api.S3_BUCKET,
			endpoint: api.S3_ENDPOINT,
			region: api.S3_REGION ?? 'us-east-1',
			credentials: { accessKeyId: api.AWS_ACCESS_KEY_ID, secretAccessKey: api.AWS_SECRET_ACCESS_KEY },
		});
		await attempt(
			checks,
			s,
			'Erreichbar, versioniert, beschreibbar, CORS für WEB_ORIGIN',
			async () => {
				const problems = await store.check(api.WEB_ORIGIN ?? '');
				return (
					problems.length === 0 ||
					problems.map((problem) => problemText[problem] ?? problem).join('; ') +
						' — mit `node apps/api/src/init-bucket.ts` einrichten.'
				);
			},
			'S3_ENDPOINT und Zugangsdaten prüfen.',
		);
		await attempt(
			checks,
			s,
			'Object Lock aktiv',
			async () => {
				const lock = await store.client.send(new GetObjectLockConfigurationCommand({ Bucket: store.bucket }));
				return (
					lock.ObjectLockConfiguration?.ObjectLockEnabled === 'Enabled' ||
					'Bucket mit Object Lock neu anlegen (lässt sich nachträglich nicht einschalten).'
				);
			},
			'Bucket mit Object Lock anlegen (`init-bucket.ts`).',
		);
	}

	if (api.SMTP_URL)
		await attempt(
			checks,
			'E-Mail',
			'SMTP-Server nimmt die Anmeldung an',
			async () => (await nodemailer.createTransport(api.SMTP_URL!).verify()) === true,
			'SMTP_URL (Benutzer, Passwort, Port 465) prüfen.',
		);

	if (api.STRIPE_SECRET_KEY)
		await attempt(
			checks,
			'Zahlungen (Stripe)',
			'Stripe-Schlüssel gültig',
			async () => {
				await new Stripe(api.STRIPE_SECRET_KEY!).balance.retrieve();
				return true;
			},
			'Schlüssel im Stripe-Dashboard prüfen.',
		);

	const o = 'Öffentliche Adressen';
	if (isHttps(api.TOKEN_ISSUER)) {
		const issuer = api.TOKEN_ISSUER!.replace(/\/$/, '');
		await attempt(
			checks,
			o,
			'API antwortet (/health)',
			async () => (await fetch(`${issuer}/health`)).ok,
			'Erst nach dem Deployment prüfbar; DNS und Caddy kontrollieren.',
		);
		await attempt(
			checks,
			o,
			'JWKS enthält den aktuellen Signaturschlüssel',
			async () => {
				const { keys } = (await (await fetch(`${issuer}/.well-known/jwks.json`)).json()) as { keys: { kid: string }[] };
				const kid = JSON.parse(api.SIGNING_KEY ?? '{}').kid;
				return keys.some((key) => key.kid === kid) || 'Die laufende API nutzt einen anderen SIGNING_KEY als api.env.';
			},
			'Erst nach dem Deployment prüfbar.',
		);
	}
	if (isHttps(api.WEB_ORIGIN))
		await attempt(
			checks,
			o,
			'Web-App mit HSTS und Content Security Policy',
			async () => {
				const response = await fetch(api.WEB_ORIGIN!);
				const html = await response.text();
				if (!response.headers.get('strict-transport-security'))
					return 'HSTS-Header fehlt — Caddyfile aus infra/production verwenden.';
				return (
					html.includes('content-security-policy') ||
					'CSP fehlt — Web-App mit `pnpm --filter @clinks/web build` neu bauen.'
				);
			},
			'Erst nach dem Deployment prüfbar.',
		);
	return checks;
}

const symbol: Record<Status, string> = { ok: '✓', warn: '!', fail: '✗' };

export function report(checks: Check[]): string {
	const lines: string[] = [];
	let group = '';
	for (const check of checks) {
		if (check.group !== group) lines.push('', check.group);
		group = check.group;
		lines.push(`  ${symbol[check.status]} ${check.text}`);
		if (check.hint) lines.push(`      → ${check.hint}`);
	}
	const failed = checks.filter((check) => check.status === 'fail').length;
	const warned = checks.filter((check) => check.status === 'warn').length;
	lines.push(
		'',
		failed ? `${failed} Punkt(e) müssen behoben werden, ${warned} Hinweis(e).` : `Bereit. ${warned} Hinweis(e).`,
	);
	return lines.join('\n');
}

if (import.meta.main) {
	// `pnpm ops:check -- …` hands the `--` through.
	const args = process.argv.slice(2).filter((arg) => arg !== '--');
	const { values } = parseArgs({ args, options: { 'config-dir': { type: 'string' }, offline: { type: 'boolean' } } });
	const given = values['config-dir'] ?? process.env.CONFIG_DIR;
	if (!given) {
		console.error('Bitte den Ordner mit api.env, collab.env und powersync.env angeben: --config-dir /pfad');
		process.exit(2);
	}
	// pnpm runs the script inside apps/api; relative paths mean the folder the operator called it from.
	const dir = resolve(process.env.INIT_CWD ?? '.', given);
	const { env, missing } = await readEnvFiles(dir);
	const checks: Check[] = missing.map((name) => ({
		group: 'Dateien',
		status: 'fail' as const,
		text: `${name} fehlt in ${dir}`,
		hint: `Vorlage: infra/production/env/${name}.example`,
	}));
	checks.push(...configChecks(env));
	if (!values.offline) checks.push(...(await connectionChecks(env)));
	console.log(report(checks));
	process.exit(checks.some((check) => check.status === 'fail') ? 1 : 0);
}
