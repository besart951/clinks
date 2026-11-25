import type {
	Appointment,
	AuditEntry,
	AuditTargetKind,
	MyVisits,
	VisitClient,
	WeekRelease,
} from '@clinks/domain/types';
import { startOfWeek, toCalendarDate } from '@clinks/domain/dates';
import { ownReleasedVisits } from '@clinks/domain/spitex-release';
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
	/**
	 * The caller's own released visits. Staff only have those on the device; planners have the whole plan, so
	 * the same rule is applied here. Clients come from the reduced table staff get, or from the contacts.
	 */
	async myVisits(): Promise<MyVisits> {
		const tenantId = this.#context.tenantId();
		const actorId = this.#context.actorId();
		if (!tenantId || !actorId || !this.#context.can('spitex.own.read'))
			throw new MockApiError('unauthorized', this.#context.localize('error.unauthorized'));
		const db = await this.#engine.database();
		const releases = (
			await db.getAll<SqliteRow>('SELECT * FROM spitex_week_releases WHERE tenant_id = ?', [tenantId])
		).map((row) => rowToRecord<WeekRelease>('spitex_week_releases', row));
		const assigned = (
			await db.getAll<SqliteRow>(
				`SELECT * FROM appointments WHERE tenant_id = ? AND kind = 'spitex' AND assignee_id = ?`,
				[tenantId, actorId],
			)
		).map((row) => rowToRecord<Appointment>('appointments', row));
		const visits = ownReleasedVisits(assigned, actorId, releases, (start) => startOfWeek(toCalendarDate(start)));
		const wanted = new Set(visits.map((visit) => visit.contactId));
		const columns = 'id, tenant_id, kind, first_name, last_name, company_name, phone, address';
		const rows = await db.getAll<{
			id: VisitClient['id'];
			kind: VisitClient['kind'];
			first_name: string;
			last_name: string;
			company_name: string;
			phone: string;
			address: string;
		}>(
			`SELECT ${columns} FROM visit_clients WHERE tenant_id = ? UNION SELECT ${columns} FROM contacts WHERE tenant_id = ?`,
			[tenantId, tenantId],
		);
		const clients = rows
			.filter((row) => wanted.has(row.id))
			.map((row): VisitClient => ({
				id: row.id,
				tenantId,
				kind: row.kind,
				firstName: row.first_name,
				lastName: row.last_name,
				companyName: row.company_name,
				phone: row.phone,
				address: JSON.parse(row.address) as VisitClient['address'],
			}));
		return { visits, clients, releases };
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
