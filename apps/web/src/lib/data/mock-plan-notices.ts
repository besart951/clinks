import { isoWeek, startOfWeek, toCalendarDate } from '@clinks/domain/dates';
import { newId, type UserId } from '@clinks/domain/ids';
import { changedVisitRecipients, isReleased } from '@clinks/domain/spitex-release';
import type { AppNotification, Appointment, CalendarDate, WeekRelease } from '@clinks/domain/types';
import { stamp, type WorkspaceCache } from './database.ts';
import type { RequestContext } from './repository.ts';

type PlanEvent = 'released' | 'withdrawn' | 'changed';

/**
 * The demo backend's stand-in for the server's plan notices (apps/api plan-writes.ts, which also mails them):
 * the people concerned hear about a release, its withdrawal and later changes, once while the notice is unread.
 * Weeks are counted in the browser's time zone.
 */
export class MockPlanNotices {
	readonly #db: WorkspaceCache;
	readonly #context: RequestContext;

	constructor(db: WorkspaceCache, context: RequestContext) {
		this.#db = db;
		this.#context = context;
	}

	visitChanged(before: Appointment | null, after: Appointment | null) {
		const releases = this.#db.table('weekReleases').filter((row) => row.tenantId === this.#context.tenantId());
		const released = (start: string) => isReleased(releases, weekOf(start));
		const weekStart = weekOf((after ?? before)!.start);
		for (const userId of changedVisitRecipients(before, after, released)) this.#notify(userId, 'changed', weekStart);
	}

	releaseChanged(before: WeekRelease | null, after: WeekRelease | null) {
		const release = (after ?? before)!;
		const assignees = this.#db
			.table('appointments')
			.filter(
				(row) =>
					row.tenantId === release.tenantId &&
					row.kind === 'spitex' &&
					row.status !== 'cancelled' &&
					weekOf(row.start) === release.weekStart,
			)
			.flatMap((row) => (row.assigneeId ? [row.assigneeId] : []));
		for (const userId of new Set(assignees)) this.#notify(userId, after ? 'released' : 'withdrawn', release.weekStart);
	}

	#notify(userId: UserId, event: PlanEvent, weekStart: CalendarDate) {
		const tenantId = this.#context.tenantId();
		if (!tenantId || userId === this.#context.actorId()) return;
		const key = `ui.ws.notification.plan_${event}`;
		const href = `/visits?week=${weekStart}`;
		const notifications = this.#db.table('notifications');
		const pending = notifications.some(
			(row) => row.userId === userId && !row.read && row.message.key === key && row.href === href,
		);
		if (pending) return;
		notifications.push(
			stamp<AppNotification>({
				id: newId(),
				tenantId,
				userId,
				kind: 'plan',
				message: { key, params: { week: String(isoWeek(weekStart)) } },
				href,
				read: false,
			}),
		);
	}
}

function weekOf(start: string): CalendarDate {
	return startOfWeek(toCalendarDate(start));
}
