import { appointmentSchema, contactSchema } from '@clinks/contracts/schemas';
import type { SyncWriteRequest } from '@clinks/contracts/sync';
import { inScope, type Tx } from '@clinks/db/scope';
import { roleGrants } from '@clinks/domain/permissions';
import type { Permission, RoleKind } from '@clinks/domain/types';
import { uploadToFields } from '@clinks/sync-schema/mapping';
import { isSyncedTable, syncedTables, type Column, type SyncedTableName } from '@clinks/sync-schema/tables';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import type { ZodType } from 'zod';
import { ApiError, forbidden } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import type { Caller, Services } from './context.ts';

/** The domain rules every write must pass, the same the mock API and the forms use. */
const schemas: { [table in SyncedTableName]: ZodType } = { contacts: contactSchema, appointments: appointmentSchema };

type Fields = { [field: string]: unknown };
type Role = { kind: RoleKind; permissions: Permission[] };

/**
 * Applies the PowerSync upload queue. Each request is one local transaction of a client; it is checked
 * (table, columns, permission, domain rules) and written in one database transaction with its audit
 * entries. Changes come back to every device through the sync streams.
 *
 * Conflicts: the server keeps no locks; each write replaces the fields it carries (last write wins per
 * field) and raises the revision.
 */
export class SyncService {
	readonly #services: Services;

	constructor(services: Services) {
		this.#services = services;
	}

	async write(claims: AccessClaims, request: SyncWriteRequest, caller: Caller): Promise<{ applied: number }> {
		const tenantId = claims.tenant_id;
		if (!tenantId) throw forbidden();
		await inScope(this.#services.db, { tenantId, userId: claims.sub }, async (tx) => {
			const role = await this.#role(tx, tenantId, claims.sub);
			for (const op of request.ops) {
				if (!isSyncedTable(op.table)) throw new ApiError(400, 'error.validation', { table: 'error.ws.not_found' });
				const table = op.table;
				if (!role || !roleGrants(role, syncedTables[table].write as Permission)) throw forbidden();
				const action = await this.#apply(tx, tenantId, table, op);
				if (action)
					await audit(
						tx,
						{ action: `${syncedTables[table].audit}.${action}`, actorId: claims.sub, tenantId, target: op.id },
						caller,
					);
			}
		});
		return { applied: request.ops.length };
	}

	async #apply(tx: Tx, tenantId: string, table: SyncedTableName, op: SyncWriteRequest['ops'][number]) {
		const now = this.#services.now();
		if (op.op === 'DELETE') {
			const deleted = await tx.deleteFrom(table).where('id', '=', op.id).executeTakeFirst();
			return deleted.numDeletedRows > 0n ? 'deleted' : null;
		}
		const { fields, unknown } = uploadToFields(table, op.data ?? {});
		if (unknown.length)
			throw new ApiError(
				400,
				'error.validation',
				Object.fromEntries(unknown.map((name) => [name, 'error.validation'])),
			);
		const existing = await tx.selectFrom(table).selectAll().where('id', '=', op.id).executeTakeFirst();
		// A patch for a row that is gone (deleted elsewhere) has nothing left to change.
		if (op.op === 'PATCH' && !existing) return null;
		const merged = { ...(existing ? dbToFields(table, existing) : {}), ...fields };
		validate(table, merged);
		await checkReferences(tx, table, fields);
		const values = fieldsToDb(table, op.op === 'PUT' ? merged : fields);
		if (existing) {
			await tx
				.updateTable(table)
				.set({ ...values, revision: (existing.revision as number) + 1, updatedAt: now })
				.where('id', '=', op.id)
				.execute();
			return 'updated';
		}
		try {
			await tx
				.insertInto(table)
				.values({ ...values, id: op.id, tenantId, revision: 1, createdAt: now, updatedAt: now })
				.execute();
		} catch (error) {
			// The id exists, but row-level security hides it: it belongs to another tenant.
			if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'error.conflict');
			throw error;
		}
		return 'created';
	}

	/** The role of the caller's active membership; the token's role claim may be up to 15 minutes old. */
	async #role(tx: Tx, tenantId: string, userId: string): Promise<Role | null> {
		const row = await tx
			.selectFrom('memberships')
			.innerJoin('roles', 'roles.id', 'memberships.roleId')
			.select(['roles.kind', 'roles.permissions'])
			.where('memberships.tenantId', '=', tenantId)
			.where('memberships.userId', '=', userId)
			.where('memberships.status', '=', 'active')
			.executeTakeFirst();
		return row ? { kind: row.kind, permissions: row.permissions as Permission[] } : null;
	}
}

/** A reference must point into the same tenant; foreign keys alone would accept another tenant's id. */
async function checkReferences(tx: Tx, table: SyncedTableName, fields: Fields) {
	for (const column of syncedTables[table].columns as readonly Column[]) {
		const target = column.references;
		const id = fields[column.field];
		if (!target || typeof id !== 'string') continue;
		// Row-level security limits the lookup to the caller's tenant.
		const found = await tx.selectFrom(target).select('id').where('id', '=', id).executeTakeFirst();
		if (!found) throw new ApiError(400, 'error.validation', { [column.field]: 'error.ws.not_found' });
	}
}

function validate(table: SyncedTableName, record: Fields) {
	const result = schemas[table].safeParse(record);
	if (result.success) return;
	const fields: { [field: string]: ProductTranslationKey } = {};
	for (const issue of result.error.issues) {
		const field = issue.path.join('.') || 'record';
		fields[field] ??= (
			issue.message.startsWith('error.') ? issue.message : 'error.validation'
		) as ProductTranslationKey;
	}
	throw new ApiError(400, 'error.validation', fields);
}

/** Kysely's camel-case plugin names columns by their snake_case name, e.g. `starts_at` → `startsAt`. */
function dbKey(column: Column): string {
	return column.column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function dbToFields(table: SyncedTableName, row: Fields): Fields {
	const fields: Fields = {};
	for (const column of syncedTables[table].columns) {
		const value = row[dbKey(column)];
		fields[column.field] = value instanceof Date ? value.toISOString() : value;
	}
	return fields;
}

function fieldsToDb(table: SyncedTableName, fields: Fields): Fields {
	const values: Fields = {};
	for (const column of syncedTables[table].columns) {
		if (!(column.field in fields)) continue;
		const value = fields[column.field];
		// pg would send a JS array as a Postgres array literal, not as JSON.
		values[dbKey(column)] =
			column.type === 'json' && value !== null && value !== undefined ? JSON.stringify(value) : value;
	}
	return values;
}
