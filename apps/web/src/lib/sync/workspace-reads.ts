import type { AuditEntry, AuditTargetKind } from '@clinks/domain/types';
import { syncedTables, syncedTableNames } from '@clinks/sync-schema/tables';
import { rowToRecord, type SqliteRow } from '@clinks/sync-schema/mapping';
import { workspaceTable } from '../data/workspace-tables.ts';
import type { UserId } from '@clinks/domain/ids';
import { MockApiError } from '../data/database.ts';
import type { RequestContext } from '../data/repository.ts';
import type { SyncEngine } from './sync-engine.svelte.ts';

/** Read-only projections of server-owned data, scoped just like writable repositories. */
export class SyncedWorkspaceReads {
	readonly #engine: SyncEngine;
	readonly #context: RequestContext;
	constructor(engine: SyncEngine, context: RequestContext) {
		this.#engine = engine;
		this.#context = context;
	}
	async activity(where: (entry: AuditEntry) => boolean = () => true) {
		const tenantId = this.#context.tenantId();
		if (!tenantId || !this.#context.can('audit.read'))
			throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
		const db = await this.#engine.database();
		const rows = await db.getAll<{
			id: AuditEntry['id'];
			actor_id: UserId;
			action: string;
			target: string;
			created_at: string;
		}>('SELECT * FROM audit WHERE tenant_id = ?', [tenantId]);
		return rows
			.map((row): AuditEntry => {
				const kind = row.action.split('.')[0] as AuditTargetKind;
				return {
					id: row.id,
					tenantId,
					actorId: row.actor_id,
					action: row.action,
					createdAt: row.created_at,
					updatedAt: row.created_at,
					revision: 1,
					target: { kind, id: row.target || tenantId, label: row.target },
				};
			})
			.filter(where);
	}
	async exportModules() {
		const tenantId = this.#context.tenantId();
		if (!tenantId || !this.#context.can('settings.manage'))
			throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
		const actorId = this.#context.actorId();
		const result: Record<string, unknown[]> = {};
		const db = await this.#engine.database();
		await db.readTransaction(async (tx) => {
			for (const table of syncedTableNames) {
				if (!this.#context.can(syncedTables[table].read)) continue;
				const personal = table === 'notifications';
				const rows = await tx.getAll<SqliteRow>(
					`SELECT * FROM ${table} WHERE tenant_id = ?${personal ? ' AND user_id = ?' : ''}`,
					personal ? [tenantId, actorId] : [tenantId],
				);
				const records = (result[workspaceTable(table)] ??= []);
				for (const row of rows) records.push(rowToRecord(table, row));
			}
		});
		if (this.#context.can('audit.read')) result.audit = await this.activity();
		return result;
	}
	async people() {
		const tenantId = this.#context.tenantId();
		if (!tenantId) return [];
		const db = await this.#engine.database();
		return db.getAll<{
			id: UserId;
			name: string;
			email: string;
			avatarColor: string;
			avatarDataUrl: null;
			jobTitle: string;
		}>(
			`
			SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.email, u.avatar_color AS avatarColor,
				NULL AS avatarDataUrl, m.job_title AS jobTitle
			FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ?`,
			[tenantId],
		);
	}
}
