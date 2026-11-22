import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const directory = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Applies the SQL files in `migrations/` in name order, each in its own transaction, and records them in
 * `schema_migrations`. Runs as the database owner, never as the API's login role.
 */
export async function migrate(connectionString: string, log: (line: string) => void = () => {}): Promise<string[]> {
	const client = new pg.Client({ connectionString });
	await client.connect();
	try {
		await client.query(
			'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
		);
		// One migrator at a time, also across machines.
		await client.query('SELECT pg_advisory_lock(72610)');
		const done = new Set(
			(await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
		);
		const pending = (await readdir(directory)).filter((name) => name.endsWith('.sql') && !done.has(name)).sort();
		for (const name of pending) {
			const statements = await readFile(directory + name, 'utf8');
			await client.query('BEGIN');
			try {
				await client.query(statements);
				await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
				await client.query('COMMIT');
				log(`applied ${name}`);
			} catch (error) {
				await client.query('ROLLBACK');
				throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
			}
		}
		return pending;
	} finally {
		await client.end();
	}
}

if (import.meta.main) {
	const url = process.env.DATABASE_OWNER_URL;
	if (!url) throw new Error('DATABASE_OWNER_URL is not set');
	const applied = await migrate(url, console.log);
	if (applied.length === 0) console.log('database is up to date');
}
