import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

// `date` columns stay 'YYYY-MM-DD' strings; as JS Dates they would shift with the server's time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
import type { Database } from './schema.ts';

export type Db = Kysely<Database>;

/** A Kysely instance over a pg pool; columns are snake_case in SQL and camelCase in TypeScript. */
export function createDb(connectionString: string, options: { max?: number } = {}): Db {
	const pool = new pg.Pool({ connectionString, max: options.max ?? 10 });
	return new Kysely<Database>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });
}
