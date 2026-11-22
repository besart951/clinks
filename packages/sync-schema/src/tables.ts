/**
 * The tables clients sync, in one place. Postgres (packages/db migrations), the PowerSync client schema
 * (generated from this file) and the API's write endpoint all follow it; a test checks the migration.
 *
 * Every table also has `id`, `tenant_id`, `revision`, `created_at` and `updated_at`, which only the server sets.
 */

/** How a value is stored: Postgres type on the server, SQLite type on the client. */
export type ColumnType = 'text' | 'uuid' | 'integer' | 'boolean' | 'json' | 'timestamp' | 'date';

export interface Column {
	/** snake_case name in Postgres and SQLite. */
	readonly column: string;
	/** camelCase name in the domain type. */
	readonly field: string;
	readonly type: ColumnType;
	readonly nullable?: boolean;
	/** Another synced table this column points to; the API checks the target is in the same tenant. */
	readonly references?: SyncedTableName;
}

export interface SyncedTable {
	readonly columns: readonly Column[];
	/** Permissions (from @clinks/domain) needed to read and to write the table. */
	readonly read: string;
	readonly write: string;
	/** The audit target kind for writes. */
	readonly audit: string;
}

const text = (column: string, field: string, nullable = false): Column => ({ column, field, type: 'text', nullable });

export const syncedTables = {
	contacts: {
		read: 'contacts.read',
		write: 'contacts.write',
		audit: 'contact',
		columns: [
			text('kind', 'kind'),
			text('first_name', 'firstName'),
			text('last_name', 'lastName'),
			text('company_name', 'companyName'),
			text('email', 'email'),
			text('phone', 'phone'),
			{ column: 'address', field: 'address', type: 'json' },
			{ column: 'birth_date', field: 'birthDate', type: 'date', nullable: true },
			text('insurer', 'insurer'),
			{ column: 'tags', field: 'tags', type: 'json' },
			text('notes', 'notes'),
			{ column: 'archived', field: 'archived', type: 'boolean' },
			text('ahv_number', 'ahvNumber', true),
			text('insurance_number', 'insuranceNumber', true),
			text('language', 'language', true),
			text('billing_mode', 'billingMode', true),
		],
	},
	appointments: {
		read: 'calendar.read',
		write: 'calendar.write',
		audit: 'appointment',
		columns: [
			text('title', 'title'),
			text('kind', 'kind'),
			text('status', 'status'),
			{ column: 'contact_id', field: 'contactId', type: 'uuid', nullable: true, references: 'contacts' },
			{ column: 'assignee_id', field: 'assigneeId', type: 'uuid', nullable: true },
			{ column: 'starts_at', field: 'start', type: 'timestamp' },
			{ column: 'ends_at', field: 'end', type: 'timestamp' },
			text('location', 'location'),
			text('notes', 'notes'),
			{ column: 'series_id', field: 'seriesId', type: 'uuid', nullable: true },
			text('service', 'service', true),
			{ column: 'arrival_window', field: 'arrivalWindow', type: 'json', nullable: true },
			{ column: 'billed_invoice_id', field: 'billedInvoiceId', type: 'uuid', nullable: true },
		],
	},
} as const satisfies { [table in SyncedTableName]: SyncedTable };

export type SyncedTableName = 'contacts' | 'appointments';

export const syncedTableNames = Object.keys(syncedTables) as SyncedTableName[];

/** Columns every synced table has, set by the server. */
export const serverColumns = [
	{ column: 'tenant_id', field: 'tenantId', type: 'uuid' },
	{ column: 'revision', field: 'revision', type: 'integer' },
	{ column: 'created_at', field: 'createdAt', type: 'timestamp' },
	{ column: 'updated_at', field: 'updatedAt', type: 'timestamp' },
] as const satisfies readonly Column[];

export function isSyncedTable(name: string): name is SyncedTableName {
	return Object.hasOwn(syncedTables, name);
}
