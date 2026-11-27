import { startOfWeek, toCalendarDate } from '@clinks/domain/dates';
import { isReleased } from '@clinks/domain/spitex-release';
import type { Appointment, CalendarDate, MyVisits, VisitClient, WeekRelease } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import { CalendarPeriod } from '../calendar/calendar-period.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** A staff member's own plan, read-only: one released week at a time. */
export class MyVisitsModel {
	readonly resource: Resource<MyVisits>;
	/** One week at a time; all released weeks are loaded at once. */
	readonly period: CalendarPeriod;

	constructor(workspace: Workspace, anchor?: CalendarDate) {
		this.period = new CalendarPeriod({
			units: ['week'],
			anchor,
			weekdays: { key: 'visits', preferences: workspace.platform.preferences },
		});
		this.resource = new Resource(workspace.db, ['appointments', 'contacts', 'weekReleases'], () =>
			workspace.api.myVisits(),
		);
	}

	/** The Monday of the week on show. */
	get week(): CalendarDate {
		return startOfWeek(this.period.anchor);
	}

	get release(): WeekRelease | null {
		return this.resource.data?.releases.find((release) => release.weekStart === this.week) ?? null;
	}

	get released(): boolean {
		return isReleased(this.resource.data?.releases ?? [], this.week);
	}

	/** The days of the week that have visits, each with its visits in order. */
	get days(): { date: CalendarDate; visits: Appointment[] }[] {
		const visits = this.resource.data?.visits ?? [];
		return this.period.shownDays
			.map((date) => ({ date, visits: visits.filter((visit) => toCalendarDate(visit.start) === date) }))
			.filter((day) => day.visits.length > 0);
	}

	client(visit: Appointment): VisitClient | null {
		return this.resource.data?.clients.find((client) => client.id === visit.contactId) ?? null;
	}

	/** Planned («new») or changed after the week was released: the plan the person saw is out of date. */
	change(visit: Appointment): 'new' | 'changed' | null {
		const releasedAt = this.release?.createdAt;
		if (!releasedAt || visit.updatedAt <= releasedAt) return null;
		return visit.createdAt > releasedAt ? 'new' : 'changed';
	}
}
