import type { TenantId, UserId } from '@clinks/domain/ids';
import { roleGrants } from '@clinks/domain/permissions';
import { recordToRow } from '@clinks/sync-schema/mapping';
import { syncedTables, type SyncedTableName } from '@clinks/sync-schema/tables';
import type { SyncWriteRequest } from '@clinks/contracts/sync';
import { roleFor } from './account-api.ts';
import type { ApiClient } from './api-client.ts';
import type { WorkspaceCache, TableName } from './database.ts';
import { workspaceTable } from './workspace-tables.ts';

// Parents precede their foreign keys. JSON links (including receipt ↔ expense) are checked at commit.
const legacyTables = [
	'folders',
	'tasks',
	'invoices',
	'documents',
	'expenses',
	'mails',
	'templates',
	'campaigns',
	'prescriptions',
	'physio_notes',
	'spitex_notes',
	'time_entries',
	'contact_comments',
	'task_comments',
	'invoice_comments',
	'notifications',
] as const satisfies readonly SyncedTableName[];

/** Acknowledged rows move out of the old mock store. Failed imports retain the complete source for retry. */
export async function importWorkspace(
	client: ApiClient,
	db: WorkspaceCache,
	tenantId: TenantId,
	userId: UserId,
	account = db,
) {
	const role = roleFor(account, userId, tenantId);
	const ops: SyncWriteRequest['ops'] = [];
	const imported = new Map<TableName, Set<string>>();
	for (const table of legacyTables) {
		if (!roleGrants(role, syncedTables[table].write)) continue;
		const collection = workspaceTable(table);
		for (const row of db.table(collection)) {
			if (row.tenantId !== tenantId) continue;
			if ('authorId' in row && row.authorId !== userId) continue;
			if ('uploadedBy' in row && row.uploadedBy !== userId) continue;
			if ('subjective' in row && table !== `${row.kind}_notes`) continue;
			if ('mentions' in row && table !== `${row.target.kind}_comments`) continue;
			const ids = imported.get(collection) ?? new Set<string>();
			ids.add(row.id);
			imported.set(collection, ids);
			ops.push({ op: 'PUT', table, id: row.id, data: recordToRow(table, { ...row }) });
		}
	}
	if (!ops.length) return;
	await client.request('POST', '/sync/import', { ops });
	db.removeImported(tenantId, imported);
}
