import type { LocalTableName } from '@clinks/sync-schema/tables';
import type { TableName } from './database.ts';

const sharedTableNames = {
	physio_notes: 'notes',
	spitex_notes: 'notes',
	time_entries: 'timeEntries',
	spitex_week_releases: 'weekReleases',
	visit_clients: 'contacts',
	contact_comments: 'comments',
	task_comments: 'comments',
	invoice_comments: 'comments',
} as const;

export type WorkspaceTable<Name extends LocalTableName> = Name extends keyof typeof sharedTableNames
	? (typeof sharedTableNames)[Name]
	: Extract<Name, TableName>;

/** Change notifications and the demo backend use domain collection names. */
export function workspaceTable<Name extends LocalTableName>(table: Name): WorkspaceTable<Name> {
	return (
		table in sharedTableNames ? sharedTableNames[table as keyof typeof sharedTableNames] : table
	) as WorkspaceTable<Name>;
}
