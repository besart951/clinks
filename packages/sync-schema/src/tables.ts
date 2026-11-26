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
	readonly references?: 'contacts' | 'appointments' | 'folders' | 'documents' | 'invoices' | 'users';
	/** Set by the server only: synced down, but a client's value is ignored on upload. */
	readonly serverSet?: boolean;
}

export interface SyncedTable {
	readonly columns: readonly Column[];
	/** Permissions (from @clinks/domain) needed to read and to write the table. */
	readonly read: string | null;
	readonly write: string | null;
	/** The audit target kind for writes. */
	readonly audit: string | null;
}

const text = (column: string, field: string, nullable = false): Column => ({ column, field, type: 'text', nullable });

const clinicalNoteColumns = [
	text('kind', 'kind'),
	{ column: 'contact_id', field: 'contactId', type: 'uuid', references: 'contacts' },
	{ column: 'appointment_id', field: 'appointmentId', type: 'uuid', nullable: true, references: 'appointments' },
	{ column: 'date', field: 'date', type: 'date' },
	{ column: 'author_id', field: 'authorId', type: 'uuid', references: 'users' },
	text('subjective', 'subjective'),
	text('objective', 'objective'),
	text('assessment', 'assessment'),
	text('plan', 'plan'),
] as const satisfies readonly Column[];

const commentColumns = [
	{ column: 'target', field: 'target', type: 'json' },
	{ column: 'author_id', field: 'authorId', type: 'uuid', references: 'users' },
	text('body', 'body'),
	{ column: 'mentions', field: 'mentions', type: 'json' },
] as const satisfies readonly Column[];

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
			{ column: 'assignee_id', field: 'assigneeId', type: 'uuid', nullable: true, references: 'users' },
			{ column: 'starts_at', field: 'start', type: 'timestamp' },
			{ column: 'ends_at', field: 'end', type: 'timestamp' },
			text('location', 'location'),
			text('notes', 'notes'),
			{ column: 'series_id', field: 'seriesId', type: 'uuid', nullable: true },
			text('service', 'service', true),
			{ column: 'arrival_window', field: 'arrivalWindow', type: 'json', nullable: true },
			{ column: 'billed_invoice_id', field: 'billedInvoiceId', type: 'uuid', nullable: true, references: 'invoices' },
		],
	},
	folders: {
		read: 'documents.read',
		write: 'documents.write',
		audit: null,
		columns: [
			text('name', 'name'),
			{ column: 'parent_id', field: 'parentId', type: 'uuid', nullable: true, references: 'folders' },
		],
	},
	documents: {
		read: 'documents.read',
		write: 'documents.write',
		audit: 'document',
		columns: [
			text('name', 'name'),
			{ column: 'folder_id', field: 'folderId', type: 'uuid', nullable: true, references: 'folders' },
			text('mime_type', 'mimeType'),
			{ column: 'size', field: 'size', type: 'integer' },
			text('data_url', 'dataUrl'),
			{ column: 'targets', field: 'targets', type: 'json' },
			{ column: 'uploaded_by', field: 'uploadedBy', type: 'uuid', references: 'users' },
			{ column: 'locked', field: 'locked', type: 'boolean', serverSet: true },
		],
	},
	invoices: {
		read: 'finance.read',
		write: 'finance.write',
		audit: 'invoice',
		columns: [
			text('number', 'number'),
			text('kind', 'kind'),
			{ column: 'contact_id', field: 'contactId', type: 'uuid', references: 'contacts' },
			{ column: 'issue_date', field: 'issueDate', type: 'date' },
			{ column: 'due_date', field: 'dueDate', type: 'date' },
			text('status', 'status'),
			{ column: 'lines', field: 'lines', type: 'json' },
			{ column: 'payments', field: 'payments', type: 'json' },
			{ column: 'reminder_level', field: 'reminderLevel', type: 'integer', serverSet: true },
			{ column: 'reminders', field: 'reminders', type: 'json', serverSet: true },
			text('notes', 'notes'),
			{ column: 'appointment_ids', field: 'appointmentIds', type: 'json' },
			{ column: 'service_from', field: 'serviceFrom', type: 'date', nullable: true },
			{ column: 'service_to', field: 'serviceTo', type: 'date', nullable: true },
			{ column: 'document_id', field: 'documentId', type: 'uuid', nullable: true, serverSet: true },
			{ column: 'pdf_sha256', field: 'pdfSha256', type: 'text', nullable: true, serverSet: true },
		],
	},
	expenses: {
		read: 'finance.read',
		write: 'finance.write',
		audit: 'expense',
		columns: [
			{ column: 'date', field: 'date', type: 'date' },
			text('description', 'description'),
			text('supplier', 'supplier'),
			text('category', 'category'),
			{ column: 'amount', field: 'amount', type: 'integer' },
			{ column: 'vat_rate', field: 'vatRate', type: 'integer' },
			{ column: 'receipt_id', field: 'receiptId', type: 'uuid', nullable: true, references: 'documents' },
			text('status', 'status'),
		],
	},
	tasks: {
		read: 'planner.read',
		write: 'planner.write',
		audit: 'task',
		columns: [
			text('title', 'title'),
			text('description', 'description'),
			text('status', 'status'),
			text('priority', 'priority'),
			{ column: 'assignee_ids', field: 'assigneeIds', type: 'json' },
			{ column: 'due_date', field: 'dueDate', type: 'date', nullable: true },
			{ column: 'labels', field: 'labels', type: 'json' },
			{ column: 'sort_order', field: 'order', type: 'integer' },
			{ column: 'contact_id', field: 'contactId', type: 'uuid', nullable: true, references: 'contacts' },
			{ column: 'checklist', field: 'checklist', type: 'json' },
		],
	},
	contact_comments: { read: 'contacts.read', write: 'contacts.read', audit: null, columns: commentColumns },
	task_comments: { read: 'planner.read', write: 'planner.read', audit: null, columns: commentColumns },
	invoice_comments: { read: 'finance.read', write: 'finance.read', audit: null, columns: commentColumns },
	mails: {
		read: 'mail.read',
		write: 'mail.write',
		audit: 'mail',
		columns: [
			text('folder', 'folder'),
			text('sender', 'from'),
			text('from_name', 'fromName'),
			{ column: 'recipients', field: 'to', type: 'json' },
			text('subject', 'subject'),
			text('body', 'body'),
			{ column: 'sent_at', field: 'sentAt', type: 'timestamp' },
			{ column: 'is_read', field: 'read', type: 'boolean' },
			{ column: 'starred', field: 'starred', type: 'boolean' },
			{ column: 'contact_id', field: 'contactId', type: 'uuid', nullable: true, references: 'contacts' },
		],
	},
	templates: {
		read: 'mail.read',
		write: 'mail.write',
		audit: null,
		columns: [text('name', 'name'), text('subject', 'subject'), text('body', 'body')],
	},
	campaigns: {
		read: 'mail.read',
		write: 'mail.write',
		audit: 'campaign',
		columns: [
			text('name', 'name'),
			text('subject', 'subject'),
			text('preview_text', 'previewText'),
			text('body', 'body'),
			text('audience_tag', 'audienceTag'),
			text('status', 'status'),
			{ column: 'scheduled_at', field: 'scheduledAt', type: 'timestamp', nullable: true },
			{ column: 'sent_at', field: 'sentAt', type: 'timestamp', nullable: true },
			{ column: 'approved_by', field: 'approvedBy', type: 'uuid', nullable: true, references: 'users' },
			{ column: 'stats', field: 'stats', type: 'json' },
		],
	},
	prescriptions: {
		read: 'physio.read',
		write: 'physio.write',
		audit: 'prescription',
		columns: [
			{ column: 'contact_id', field: 'contactId', type: 'uuid', references: 'contacts' },
			text('doctor', 'doctor'),
			text('diagnosis', 'diagnosis'),
			text('tariff', 'tariff'),
			{ column: 'sessions_prescribed', field: 'sessionsPrescribed', type: 'integer' },
			{ column: 'issued_on', field: 'issuedOn', type: 'date' },
			{ column: 'valid_until', field: 'validUntil', type: 'date' },
		],
	},
	physio_notes: { read: 'physio.read', write: 'physio.write', audit: 'note', columns: clinicalNoteColumns },
	spitex_notes: { read: 'spitex.read', write: 'spitex.write', audit: 'note', columns: clinicalNoteColumns },
	time_entries: {
		read: 'spitex.read',
		write: 'spitex.write',
		audit: null,
		columns: [
			{ column: 'user_id', field: 'userId', type: 'uuid', references: 'users' },
			{ column: 'appointment_id', field: 'appointmentId', type: 'uuid', nullable: true, references: 'appointments' },
			{ column: 'date', field: 'date', type: 'date' },
			{ column: 'minutes', field: 'minutes', type: 'integer' },
			text('description', 'description'),
		],
	},
	spitex_week_releases: {
		read: 'spitex.own.read',
		write: 'spitex.release',
		audit: 'plan',
		columns: [
			{ column: 'week_start', field: 'weekStart', type: 'date' },
			{ column: 'released_by', field: 'releasedBy', type: 'uuid', references: 'users' },
		],
	},
	notifications: {
		read: null,
		write: null,
		audit: null,
		columns: [
			{ column: 'user_id', field: 'userId', type: 'uuid', references: 'users' },
			text('kind', 'kind'),
			{ column: 'message', field: 'message', type: 'json' },
			text('href', 'href'),
			{ column: 'is_read', field: 'read', type: 'boolean' },
		],
	},
} as const satisfies Record<string, SyncedTable>;

export type SyncedTableName = keyof typeof syncedTables;

export const syncedTableNames = Object.keys(syncedTables) as SyncedTableName[];

/** Columns every synced table has, set by the server. */
export const serverColumns = [
	{ column: 'tenant_id', field: 'tenantId', type: 'uuid' },
	{ column: 'revision', field: 'revision', type: 'integer' },
	{ column: 'created_at', field: 'createdAt', type: 'timestamp' },
	{ column: 'updated_at', field: 'updatedAt', type: 'timestamp' },
] as const satisfies readonly Column[];

/** Columns only the server keeps: they are neither uploaded nor part of the client schema. */
export const serverOnlyColumns: { readonly [table in SyncedTableName]?: readonly string[] } = {
	// Set by triggers from the week's release; sync streams and row-level security read it.
	appointments: ['published'],
};

export function isSyncedTable(name: string): name is SyncedTableName {
	return Object.hasOwn(syncedTables, name);
}

/** Projections used by the directory and activity feed. The upload endpoint only accepts syncedTables. */
export const readOnlyColumns = {
	audit: ['tenant_id', 'actor_id', 'action', 'target', 'created_at'],
	users: ['first_name', 'last_name', 'email', 'avatar_color'],
	memberships: ['tenant_id', 'user_id', 'job_title'],
	/** The part of a client's contact that staff get for their released visits. */
	visit_clients: ['tenant_id', 'kind', 'first_name', 'last_name', 'company_name', 'phone', 'address'],
} as const;

export type LocalTableName = SyncedTableName | keyof typeof readOnlyColumns;
export const localTableNames: LocalTableName[] = [
	...syncedTableNames,
	'audit',
	'users',
	'memberships',
	'visit_clients',
];
