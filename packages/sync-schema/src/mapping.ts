import { serverColumns, syncedTables, type Column, type SyncedTableName } from './tables.ts';

/** A row as SQLite holds it: text, numbers and null. */
export type SqliteRow = { [column: string]: string | number | null };

function columnsOf(table: SyncedTableName): readonly Column[] {
	return [...serverColumns, ...syncedTables[table].columns];
}

function fromSqlite(column: Column, value: unknown): unknown {
	if (value === null || value === undefined) return column.nullable ? null : column.type === 'boolean' ? false : value;
	if (column.type === 'boolean') return value === true || value === 1 || value === '1' || value === 'true';
	if (column.type === 'json') return typeof value === 'string' ? JSON.parse(value) : value;
	if (column.type === 'integer') return Number(value);
	return value;
}

function toSqlite(column: Column, value: unknown): string | number | null {
	if (value === null || value === undefined) return null;
	if (column.type === 'boolean') return value ? 1 : 0;
	if (column.type === 'json') return JSON.stringify(value);
	if (column.type === 'integer') return Number(value);
	return String(value);
}

/** A local row as a domain record (`id` plus camelCase fields). */
export function rowToRecord<T>(table: SyncedTableName, row: SqliteRow): T {
	const record: { [field: string]: unknown } = { id: row.id };
	for (const column of columnsOf(table)) {
		const value = fromSqlite(column, row[column.column]);
		// Optional domain fields stay absent rather than null, as the mock API stores them.
		if (value === null && column.nullable && column.type === 'text') continue;
		record[column.field] = value;
	}
	return record as T;
}

/** The fields of a record (or patch) as SQLite columns; fields the table does not sync are left out. */
export function recordToRow(table: SyncedTableName, record: { [field: string]: unknown }): SqliteRow {
	const row: SqliteRow = {};
	for (const column of columnsOf(table))
		if (column.field in record) row[column.column] = toSqlite(column, record[column.field]);
	return row;
}

/**
 * Client data of an upload (snake_case columns, SQLite values) as domain fields. Server-owned columns
 * are ignored; unknown columns are reported so the API can refuse them.
 */
export function uploadToFields(
	table: SyncedTableName,
	data: { [column: string]: unknown },
): { fields: { [field: string]: unknown }; unknown: string[] } {
	const byColumn = new Map(syncedTables[table].columns.map((column) => [column.column, column as Column]));
	const fields: { [field: string]: unknown } = {};
	const unknown: string[] = [];
	for (const [name, value] of Object.entries(data)) {
		if (serverColumns.some((column) => column.column === name) || name === 'id') continue;
		const column = byColumn.get(name);
		if (!column) unknown.push(name);
		else {
			try {
				fields[column.field] = fromSqlite(column, value as string | number | null);
			} catch {
				unknown.push(name);
			}
		}
	}
	return { fields, unknown };
}
