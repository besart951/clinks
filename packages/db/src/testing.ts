import pg from 'pg';
import { migrate } from './migrate.ts';

/** Connection URLs of the dev services; CI sets the same variables for its service containers. */
const ownerUrl = process.env.TEST_DATABASE_OWNER_URL ?? 'postgres://clinks:clinks-dev@localhost:5432/clinks';
const appUser = process.env.TEST_DATABASE_APP_USER ?? 'clinks_api:clinks-api-dev';

function withDatabase(url: string, database: string): string {
	const parsed = new URL(url);
	parsed.pathname = `/${database}`;
	return parsed.toString();
}

export interface TestDatabase {
	/** Superuser connection: seeds data past row-level security. */
	ownerUrl: string;
	/** The API's login role: row-level security applies. */
	appUrl: string;
	drop(): Promise<void>;
}

/** Creates an empty, migrated database for one test file and drops it afterwards. */
export async function createTestDatabase(): Promise<TestDatabase> {
	const name = `clinks_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	const admin = new pg.Client({ connectionString: ownerUrl });
	await admin.connect();
	await admin.query(`CREATE DATABASE ${name}`);
	await admin.end();
	const owner = withDatabase(ownerUrl, name);
	await migrate(owner);
	const app = new URL(owner);
	[app.username, app.password] = appUser.split(':');
	return {
		ownerUrl: owner,
		appUrl: app.toString(),
		async drop() {
			const client = new pg.Client({ connectionString: ownerUrl });
			await client.connect();
			await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
			await client.end();
		},
	};
}
