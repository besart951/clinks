import { addDays, startOfWeek, toCalendarDate, today, weekDays } from '@clinks/domain/dates';
import { isReleased } from '@clinks/domain/spitex-release';
import type { Appointment, CalendarDate, MyVisits, VisitClient, WeekRelease } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

/** A staff member's own plan, read-only: one released week at a time. */
export class MyVisitsModel {
	readonly resource: Resource<MyVisits>;
	/** The Monday of the week on show. */
	week = $state<CalendarDate>(startOfWeek(today()));

	constructor(workspace: Workspace) {
		this.resource = new Resource(workspace.db, ['appointments', 'contacts', 'weekReleases'], () =>
			workspace.api.myVisits(),
		);
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
		return weekDays(this.week, 7)
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

	go(weeks: -1 | 0 | 1) {
		this.week = weeks === 0 ? startOfWeek(today()) : addDays(this.week, weeks * 7);
	}

	show(date: CalendarDate) {
		this.week = startOfWeek(date);
	}
}
