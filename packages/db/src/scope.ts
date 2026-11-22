import { sql, type Transaction } from 'kysely';
import type { Db } from './client.ts';
import type { Database } from './schema.ts';

export type Tx = Transaction<Database>;

/** Who a transaction acts for. Row-level security reads both values. */
export interface Scope {
	tenantId: string | null;
	userId: string | null;
}

/**
 * Runs `work` in a transaction whose row-level security sees only `scope`.
 * The settings are transaction-local, so a pooled connection never leaks them to the next caller.
 */
export function inScope<T>(db: Db, scope: Scope, work: (tx: Tx) => Promise<T>): Promise<T> {
	return db.transaction().execute(async (tx) => {
		await sql`select set_config('app.tenant_id', ${scope.tenantId ?? ''}, true), set_config('app.user_id', ${scope.userId ?? ''}, true)`.execute(
			tx,
		);
		return work(tx);
	});
}
