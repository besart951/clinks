import { startOfWeek } from './dates.ts';
import type { UserId } from './ids.ts';
import type { Appointment, CalendarDate, Timestamp, WeekRelease } from './types.ts';

/** The calendar date of a moment in a time zone, e.g. the tenant's, wherever the code runs. */
export function calendarDateIn(value: Timestamp, timeZone: string): CalendarDate {
	// en-CA formats as YYYY-MM-DD.
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
		new Date(value),
	);
}

/** The Monday of the week a visit falls into, in the tenant's time zone: a Sunday 23:30 visit stays in its week. */
export function visitWeek(start: Timestamp, timeZone: string): CalendarDate {
	return startOfWeek(calendarDateIn(start, timeZone));
}

export function isReleased(releases: readonly Pick<WeekRelease, 'weekStart'>[], weekStart: CalendarDate): boolean {
	return releases.some((release) => release.weekStart === weekStart);
}

type Visit = Pick<Appointment, 'kind' | 'assigneeId' | 'start' | 'end' | 'status' | 'location' | 'contactId'>;

/**
 * Who has to hear about a change to the plan: the people whose released visits changed. `before` or `after`
 * is `null` for a new or a removed visit. A visit moved to someone else concerns both; drafts concern nobody.
 */
export function changedVisitRecipients(
	before: Visit | null,
	after: Visit | null,
	released: (start: Timestamp) => boolean,
): UserId[] {
	const concerns = (visit: Visit | null): visit is Visit & { assigneeId: UserId } =>
		visit !== null && visit.kind === 'spitex' && visit.assigneeId !== null && released(visit.start);
	const from = concerns(before) ? before : null;
	const to = concerns(after) ? after : null;
	if (from && to) {
		const same =
			from.assigneeId === to.assigneeId &&
			from.start === to.start &&
			from.end === to.end &&
			from.status === to.status &&
			from.location === to.location &&
			from.contactId === to.contactId;
		if (same) return [];
	}
	return [...new Set([from?.assigneeId, to?.assigneeId].filter((id): id is UserId => id != null))];
}
