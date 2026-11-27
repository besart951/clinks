import { coreModules } from '@clinks/domain/types';
import { workspaceSchemas } from '@clinks/contracts/workspace-schemas';
import type { SyncWriteRequest } from '@clinks/contracts/sync';
import { inScope, type Tx } from '@clinks/db/scope';
import { roleGrants } from '@clinks/domain/permissions';
import { activeRole } from './permissions.ts';
import { storeDocument } from './files.ts';
import { uploadToFields } from '@clinks/sync-schema/mapping';
import { isSyncedTable, syncedTables, type Column, type SyncedTableName } from '@clinks/sync-schema/tables';
import type { ProductTranslationKey } from '@clinks/i18n-types';
import { z } from 'zod';
import { ApiError, forbidden } from '../errors.ts';
import type { AccessClaims } from '../tokens.ts';
import { audit } from './audit.ts';
import { PlanWrites } from './plan-writes.ts';
import { InvoiceArchive } from './invoice-archive.ts';
import type { Caller, Services } from './context.ts';

type Fields = { [field: string]: unknown };

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
	readonly #archive: InvoiceArchive;

	constructor(services: Services) {
		this.#services = services;
		this.#archive = new InvoiceArchive(services);
	}

	async write(
		claims: AccessClaims,
		request: SyncWriteRequest,
		caller: Caller,
		mode: 'upload' | 'import' = 'upload',
	): Promise<{ applied: number }> {
		const tenantId = claims.tenant_id;
		if (!tenantId) throw forbidden();
		await inScope(this.#services.db, { tenantId, userId: claims.sub }, async (tx) => {
			const deferred: { table: SyncedTableName; fields: Fields }[] = [];
			const role = await activeRole(tx, tenantId, claims.sub);
			if (!role) throw forbidden();
			const entitlements = await tx
				.selectFrom('tenants')
				.select(['enabledModules', 'timeZone'])
				.where('id', '=', tenantId)
				.executeTakeFirst();
			const modules = new Set([...coreModules, ...(entitlements?.enabledModules ?? [])]);
			const plan = new PlanWrites(
				this.#services,
				{ tenantId, userId: claims.sub, timeZone: entitlements?.timeZone ?? 'Europe/Zurich' },
				role,
			);
			for (const op of request.ops) {
				if (!isSyncedTable(op.table)) throw new ApiError(400, 'error.validation', { table: 'error.ws.not_found' });
				const table = op.table;
				const permission = syncedTables[table].write;
				if (!roleGrants(role, permission) || (permission && !modules.has(permission.split('.')[0]))) throw forbidden();
				if (op.data?.tenant_id !== undefined && op.data.tenant_id !== tenantId) throw forbidden();
				const action = await this.#apply(
					tx,
					{ tenantId, userId: claims.sub, plan },
					table,
					op,
					mode === 'import' ? deferred : null,
				);
				if (action && syncedTables[table].audit)
					await audit(
						tx,
						{ action: `${syncedTables[table].audit}.${action}`, actorId: claims.sub, tenantId, target: op.id },
						caller,
					);
			}
			for (const { table, fields } of deferred) await checkReferences(tx, tenantId, table, fields);
			await plan.record(tx);
		}).catch((error: unknown) => {
			const code = (error as { code?: string }).code;
			if (code === '23503') throw new ApiError(409, 'error.conflict');
			if (code === '23502' || code === '23514' || code?.startsWith('22')) throw new ApiError(400, 'error.validation');
			throw error;
		});
		return { applied: request.ops.length };
	}

	async #apply(
		tx: Tx,
		scope: { tenantId: string; userId: string; plan: PlanWrites },
		table: SyncedTableName,
		op: SyncWriteRequest['ops'][number],
		deferred: { table: SyncedTableName; fields: Fields }[] | null,
	) {
		const clinical = table === 'physio_notes' || table === 'spitex_notes';
		if (clinical && op.op !== 'PUT') throw forbidden();
		if (op.op === 'DELETE') return this.#applyDelete(tx, scope.plan, table, op.id);
		const { fields, unknown } = uploadToFields(table, op.data ?? {});
		if (unknown.length)
			throw new ApiError(
				400,
				'error.validation',
				Object.fromEntries(unknown.map((name) => [name, 'error.validation'])),
			);
		const existing = await tx.selectFrom(table).selectAll().where('id', '=', op.id).forUpdate().executeTakeFirst();
		// A patch for a row that is gone (deleted elsewhere) has nothing left to change.
		if ((op.op === 'PATCH' && !existing) || (deferred && existing)) return null;
		// PowerSync can omit null columns on insert.
		const merged = { ...dbToFields(table, existing ?? {}), ...fields };
		validate(table, merged);
		const check = this.#enforceWriteInvariants(scope, table, op.op, existing, fields, merged);
		if (check === 'skip') return null;
		if (deferred) deferred.push({ table, fields });
		else await checkReferences(tx, scope.tenantId, table, fields);
		return this.#persistRow(tx, scope, table, op, existing, fields, merged);
	}

	async #applyDelete(tx: Tx, plan: PlanWrites, table: SyncedTableName, id: string) {
		const row = await tx.selectFrom(table).selectAll().where('id', '=', id).executeTakeFirst();
		const stored = row ? dbToFields(table, row) : null;
		plan.check(table, 'DELETE', stored, null);
		if (stored) await plan.changing(tx, table, id, stored, null);
		const deleted = await tx.deleteFrom(table).where('id', '=', id).executeTakeFirst();
		return deleted.numDeletedRows > 0n ? 'deleted' : null;
	}

	#enforceWriteInvariants(
		scope: { userId: string; plan: PlanWrites },
		table: SyncedTableName,
		op: SyncWriteRequest['ops'][number]['op'],
		existing: Fields | undefined,
		fields: Fields,
		merged: Fields,
	): 'apply' | 'skip' {
		if ((table === 'physio_notes' || table === 'spitex_notes') && existing) {
			const saved = dbToFields(table, existing);
			if (Object.entries(fields).some(([key, value]) => saved[key] !== value)) throw forbidden();
			return 'skip';
		}
		const stored = existing ? dbToFields(table, existing) : null;
		scope.plan.check(table, op, stored, merged);
		// Putting a release that exists changes nothing.
		if (table === 'spitex_week_releases' && existing) return 'skip';
		if (
			(table.endsWith('_comments') || table.endsWith('_notes')) &&
			fields.authorId !== undefined &&
			fields.authorId !== (existing?.authorId ?? scope.userId)
		)
			throw forbidden();
		if (
			table === 'documents' &&
			fields.uploadedBy !== undefined &&
			fields.uploadedBy !== (existing?.uploadedBy ?? scope.userId)
		)
			throw forbidden();
		// Once approved, a campaign's content is what was approved: back to draft first (withdraw) to change it.
		if (table === 'campaigns' && stored && !['draft', 'review'].includes(String(stored.status))) throw forbidden();
		// Only «Senden» files a mail under Gesendet: a new row or a draft cannot pretend to be sent.
		if (table === 'mails' && merged.folder === 'sent' && (stored?.folder ?? 'drafts') === 'drafts') throw forbidden();
		if (
			table === 'notifications' &&
			existing &&
			Object.keys(fields).some((key) => key !== 'read' && fields[key] !== dbToFields(table, existing)[key])
		)
			throw forbidden();
		return 'apply';
	}

	async #persistRow(
		tx: Tx,
		scope: { tenantId: string; userId: string; plan: PlanWrites },
		table: SyncedTableName,
		op: SyncWriteRequest['ops'][number],
		existing: Fields | undefined,
		fields: Fields,
		merged: Fields,
	) {
		const now = this.#services.now();
		const stored = existing ? dbToFields(table, existing) : null;
		const values = fieldsToDb(table, op.op === 'PUT' ? merged : fields);
		if (
			table === 'documents' &&
			(fields.dataUrl !== undefined || fields.size !== undefined || fields.mimeType !== undefined)
		)
			Object.assign(values, await storeDocument(tx, this.#services, scope, op.id, merged, existing?.dataUrl));
		await scope.plan.changing(tx, table, op.id, stored, merged);
		if (existing) {
			await tx
				.updateTable(table)
				.set({ ...values, revision: (existing.revision as number) + 1, updatedAt: now })
				.where('id', '=', op.id)
				.execute();
		} else {
			try {
				await tx
					.insertInto(table)
					.values({ ...values, id: op.id, tenantId: scope.tenantId, revision: 1, createdAt: now, updatedAt: now })
					.execute();
			} catch (error) {
				// The id exists, but row-level security hides it: it belongs to another tenant.
				if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'error.conflict');
				throw error;
			}
		}
		// Issued now: the PDF/A is archived with the invoice, in the same transaction.
		if (table === 'invoices' && (stored?.status ?? 'draft') === 'draft' && merged.status !== 'draft')
			await this.#archive.issue(tx, scope, op.id);
		return existing ? 'updated' : 'created';
	}
}

/** A reference must point into the same tenant; foreign keys alone would accept another tenant's id. */
async function checkReferences(tx: Tx, tenantId: string, table: SyncedTableName, fields: Fields) {
	const targets = { contact: 'contacts', invoice: 'invoices', task: 'tasks', expense: 'expenses' } as const;
	type Target = keyof typeof targets;
	type Reference = NonNullable<Column['references']> | 'tasks' | 'expenses';
	const references = new Map<Reference, Set<string>>();
	function add(target: Reference, value: unknown) {
		if (value == null) return;
		if (!z.uuid().safeParse(value).success) throw new ApiError(400, 'error.validation');
		const ids = references.get(target) ?? new Set<string>();
		ids.add(value as string);
		references.set(target, ids);
	}
	for (const column of syncedTables[table].columns as readonly Column[])
		if (column.references) add(column.references, fields[column.field]);
	for (const id of (fields.appointmentIds ?? []) as string[]) add('appointments', id);
	for (const id of (fields.assigneeIds ?? fields.mentions ?? []) as string[]) add('users', id);
	const links = (fields.targets ?? (fields.target ? [fields.target] : [])) as { kind: Target; id: string }[];
	for (const link of links) add(targets[link.kind], link.id);
	for (const [target, ids] of references) {
		const rows =
			target === 'users'
				? await tx
						.selectFrom('memberships')
						.select('userId')
						.where('tenantId', '=', tenantId)
						.where('status', '=', 'active')
						.where('userId', 'in', [...ids])
						.execute()
				: await tx
						.selectFrom(target)
						.select('id')
						.where('id', 'in', [...ids])
						.execute();
		if (rows.length !== ids.size) throw new ApiError(400, 'error.validation', { reference: 'error.ws.not_found' });
	}
}

function validate(table: SyncedTableName, record: Fields) {
	const result = workspaceSchemas[table].safeParse(record);
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
		if (value !== undefined || ('nullable' in column && column.nullable))
			fields[column.field] = value instanceof Date ? value.toISOString() : (value ?? null);
	}
	return fields;
}

function fieldsToDb(table: SyncedTableName, fields: Fields): Fields {
	const values: Fields = {};
	for (const column of syncedTables[table].columns) {
		// Server-owned columns keep what the server set (or their default); an upload never writes them.
		if (!(column.field in fields) || ('serverSet' in column && column.serverSet)) continue;
		const value = fields[column.field];
		// pg would send a JS array as a Postgres array literal, not as JSON.
		values[dbKey(column)] =
			column.type === 'json' && value !== null && value !== undefined ? JSON.stringify(value) : value;
	}
	return values;
}
