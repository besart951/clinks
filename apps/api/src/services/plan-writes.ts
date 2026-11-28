import type { Tx } from '@clinks/db/scope';
import { roleGrants } from '@clinks/domain/permissions';
import { changedVisitRecipients, visitWeek } from '@clinks/domain/spitex-release';
import type { Appointment, Permission, RoleKind } from '@clinks/domain/types';
import type { SyncedTableName } from '@clinks/sync-schema/tables';
import { forbidden } from '../errors.ts';
import type { Services } from './context.ts';
import { changeWindow, recordPlanNotices, weekAssignees, type PlanNotice } from './plan-notices.ts';

type Fields = { [field: string]: unknown };
type Visit = Pick<Appointment, 'kind' | 'assigneeId' | 'start' | 'end' | 'status' | 'location' | 'contactId'>;

/**
 * The Spitex plan's rules for one sync upload: who may change visits and releases, and whom a change concerns.
 * The sync service calls it around each write; it collects the notices and records them with the upload.
 */
export class PlanWrites {
	readonly #services: Services;
	readonly #tenantId: string;
	readonly #userId: string;
	readonly #timeZone: string;
	readonly #planner: boolean;
	readonly #seesPlan: boolean;
	readonly #writesCalendar: boolean;
	readonly #notices: PlanNotice[] = [];

	constructor(
		services: Services,
		scope: { tenantId: string; userId: string; timeZone: string },
		role: { kind: RoleKind; permissions: Permission[] },
	) {
		this.#services = services;
		this.#tenantId = scope.tenantId;
		this.#userId = scope.userId;
		this.#timeZone = scope.timeZone;
		this.#planner = roleGrants(role, 'spitex.write');
		this.#writesCalendar = roleGrants(role, 'calendar.write');
		this.#seesPlan = roleGrants(role, 'spitex.read');
	}

	/** Refuses a write the plan does not allow. `existing` and `merged` are `null` for a delete's new state. */
	check(table: SyncedTableName, op: 'PUT' | 'PATCH' | 'DELETE', existing: Fields | null, merged: Fields | null) {
		if (table === 'spitex_visit_needs' && (!this.#seesPlan || !this.#writesCalendar || op === 'DELETE'))
			throw forbidden();
		if (table === 'spitex_week_releases') {
			// Releasing touches every visit of the week, so it takes the whole plan in view; a release is given or
			// withdrawn, never edited, and only in one's own name.
			if (!this.#seesPlan || op === 'PATCH') throw forbidden();
			if (merged && !existing && merged.releasedBy !== this.#userId) throw forbidden();
		}
		// Spitex visits belong to the plan: the calendar's write permission alone does not change them.
		if (table === 'appointments' && !this.#planner && (existing?.kind === 'spitex' || merged?.kind === 'spitex'))
			throw forbidden();
	}

	/** Notes whom a change concerns: before the row is written, so the stored state is still at hand. */
	async changing(tx: Tx, table: SyncedTableName, id: string, existing: Fields | null, merged: Fields | null) {
		if (table === 'appointments') await this.#visitChanged(tx, existing as Visit | null, merged as Visit | null);
		if (table === 'spitex_week_releases') {
			const event = merged && !existing ? 'released' : !merged && existing ? 'withdrawn' : null;
			if (event) await this.#weekChanged(tx, event, ((merged ?? existing) as Fields).weekStart as string, id);
		}
	}

	/** In the upload's transaction: the in-app notices and the mails. */
	async record(tx: Tx) {
		await recordPlanNotices(tx, this.#services, { tenantId: this.#tenantId, userId: this.#userId }, this.#notices);
	}

	/** A release or its withdrawal concerns everyone with visits in that week. */
	async #weekChanged(tx: Tx, event: 'released' | 'withdrawn', weekStart: string, releaseId: string) {
		for (const userId of await weekAssignees(tx, this.#tenantId, weekStart))
			this.#notices.push({ userId, event, weekStart, once: releaseId });
	}

	/** A visit of a released week was planned, changed, reassigned or removed: tell the people it concerns. */
	async #visitChanged(tx: Tx, stored: Visit | null, uploaded: Visit | null) {
		if (stored?.kind !== 'spitex' && uploaded?.kind !== 'spitex') return;
		// The same moment can arrive spelled differently (offset, precision); compare instants.
		const instants = (visit: Visit | null) =>
			visit && { ...visit, start: new Date(visit.start).toISOString(), end: new Date(visit.end).toISOString() };
		const before = instants(stored);
		const after = instants(uploaded);
		const weekOf = (start: string) => visitWeek(start, this.#timeZone);
		const weeks = [...new Set([before, after].flatMap((visit) => (visit ? [weekOf(visit.start)] : [])))];
		const released = new Set(
			(
				await tx
					.selectFrom('spitex_week_releases')
					.select('weekStart')
					.where('tenantId', '=', this.#tenantId)
					.where('weekStart', 'in', weeks)
					.execute()
			).map((row) => row.weekStart),
		);
		const weekStart = weekOf((after ?? before)!.start);
		const once = changeWindow(this.#services.now());
		for (const userId of changedVisitRecipients(before, after, (start) => released.has(weekOf(start))))
			this.#notices.push({ userId, event: 'changed', weekStart, once });
	}
}
