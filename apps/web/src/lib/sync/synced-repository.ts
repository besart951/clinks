import type { Draft, Patch, Repository, VersionedRecord } from '@clinks/contracts/repository';
import { newId, type TenantId } from '@clinks/domain/ids';
import type { Permission } from '@clinks/domain/types';
import { recordToRow, rowToRecord, type SqliteRow } from '@clinks/sync-schema/mapping';
import type { SyncedTableName } from '@clinks/sync-schema/tables';
import type { ZodType } from 'zod';
import { MockApiError } from '../data/database.ts';
import { validationError, type RequestContext } from '../data/repository.ts';
import type { SyncEngine } from './sync-engine.svelte.ts';

type Synced = VersionedRecord & { tenantId: TenantId; updatedAt: string };

export interface SyncedRepositoryConfig {
	table: SyncedTableName;
	read: Permission;
	write: Permission;
	schema: ZodType;
}

/**
 * Tenant data in the synced local database. Reads and writes are local and work offline; PowerSync
 * uploads the writes and the API checks them again (permission, domain rules, tenant).
 */
export class SyncedRepository<Row extends Synced> implements Repository<Row> {
	readonly #engine: SyncEngine;
	readonly #context: RequestContext;
	readonly #config: SyncedRepositoryConfig;

	constructor(engine: SyncEngine, context: RequestContext, config: SyncedRepositoryConfig) {
		this.#engine = engine;
		this.#context = context;
		this.#config = config;
	}

	async list(where: (row: Row) => boolean = () => true): Promise<Row[]> {
		const tenantId = this.#authorize(this.#config.read);
		const database = await this.#engine.database();
		const rows = await database.getAll<SqliteRow>(`SELECT * FROM ${this.#config.table} WHERE tenant_id = ?`, [
			tenantId,
		]);
		return rows.map((row) => rowToRecord<Row>(this.#config.table, row)).filter(where);
	}

	async get(id: Row['id']): Promise<Row> {
		const tenantId = this.#authorize(this.#config.read);
		const row = await this.#find(id, tenantId);
		if (!row) throw new MockApiError('not_found', this.#context.localize('error.ws.not_found'));
		return row;
	}

	async create(draft: Draft<Row>): Promise<Row> {
		const tenantId = this.#authorize(this.#config.write);
		const now = new Date().toISOString();
		const record = { ...draft, id: newId(), tenantId, revision: 1, createdAt: now, updatedAt: now } as unknown as Row;
		this.#validate(record);
		await this.#insert(record);
		return record;
	}

	async update(id: Row['id'], revision: number, patch: Patch<Row>): Promise<Row> {
		const tenantId = this.#authorize(this.#config.write);
		const current = await this.get(id);
		if (current.revision !== revision) throw new MockApiError('conflict', this.#context.localize('error.conflict'));
		const next = {
			...current,
			...patch,
			id,
			tenantId,
			revision: revision + 1,
			updatedAt: new Date().toISOString(),
		} as Row;
		this.#validate(next);
		// Only the changed fields go into the upload, so a concurrent edit of other fields survives.
		const changes = recordToRow(this.#config.table, { ...patch, revision: next.revision, updatedAt: next.updatedAt });
		const columns = Object.keys(changes);
		const database = await this.#engine.database();
		await database.execute(
			`UPDATE ${this.#config.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ? AND tenant_id = ?`,
			[...Object.values(changes), id, tenantId],
		);
		return next;
	}

	async remove(id: Row['id']): Promise<void> {
		const tenantId = this.#authorize(this.#config.write);
		const database = await this.#engine.database();
		await database.execute(`DELETE FROM ${this.#config.table} WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
	}

	/** Puts a removed record back, used by undo. */
	async restore(record: Row): Promise<Row> {
		const tenantId = this.#authorize(this.#config.write);
		if (record.tenantId !== tenantId)
			throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
		await this.#insert(record);
		return record;
	}

	#insert(record: Row) {
		return this.#engine.insert(this.#config.table, [record]);
	}

	async #find(id: string, tenantId: TenantId): Promise<Row | null> {
		const database = await this.#engine.database();
		const row = await database.getOptional<SqliteRow>(
			`SELECT * FROM ${this.#config.table} WHERE id = ? AND tenant_id = ?`,
			[id, tenantId],
		);
		return row ? rowToRecord<Row>(this.#config.table, row) : null;
	}

	#authorize(permission: Permission): TenantId {
		const tenantId = this.#context.tenantId();
		if (!tenantId || !this.#context.can(permission))
			throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
		return tenantId;
	}

	#validate(value: unknown) {
		const error = validationError(this.#config.schema, value, (key) => this.#context.localize(key));
		if (error) throw error;
	}
}
