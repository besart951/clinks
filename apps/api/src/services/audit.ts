import type { Db } from '@clinks/db/client';
import type { Tx } from '@clinks/db/scope';
import { uuid } from '../crypto.ts';
import type { Caller } from './context.ts';

/** Security-relevant events. Outside a tenant scope only entries without tenant are allowed (RLS). */
export async function audit(
	db: Db | Tx,
	entry: {
		action: string;
		actorId: string | null;
		tenantId?: string | null;
		target?: string;
		meta?: Record<string, unknown>;
	},
	caller: Pick<Caller, 'ip'> | null,
) {
	await db
		.insertInto('audit')
		.values({
			id: uuid(),
			tenantId: entry.tenantId ?? null,
			actorId: entry.actorId,
			action: entry.action,
			target: entry.target ?? '',
			meta: entry.meta ?? {},
			ip: caller?.ip ?? null,
		})
		.execute();
}
