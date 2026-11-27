import { addDays, minutesBetween, startOfWeek, toCalendarDate } from '@clinks/domain/dates';
import type { UserId } from '@clinks/domain/ids';
import type { Appointment, CalendarDate, Task } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import { CalendarPeriod } from '../calendar/calendar-period.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface PersonWeek {
	appointments: Appointment[];
	tasks: Task[];
}

/** What one staff member has on: appointments of a week, open tasks and how full each day is. */
export class PersonDetailModel {
	readonly resource: Resource<PersonWeek>;
	readonly period: CalendarPeriod;

	constructor(workspace: Workspace, id: UserId) {
		const { api, session } = workspace;
		this.period = new CalendarPeriod({
			units: ['week'],
			weekdays: { key: 'person', preferences: workspace.platform.preferences },
			onchange: () => void this.resource.reload(true),
		});
		this.resource = new Resource(workspace.db, ['appointments', 'tasks'], async () => {
			const from = this.week;
			const to = addDays(from, 6);
			const [appointments, tasks] = await Promise.all([
				session.can('calendar.read')
					? api.appointments.list(
							(row) =>
								row.assigneeId === id &&
								row.status !== 'cancelled' &&
								toCalendarDate(row.start) >= from &&
								toCalendarDate(row.start) <= to,
						)
					: [],
				session.can('planner.read') && session.hasModule('planner')
					? api.tasks.list((row) => row.assigneeIds.includes(id) && row.status !== 'done')
					: [],
			]);
			return {
				appointments: appointments.sort((left, right) => left.start.localeCompare(right.start)),
				tasks: tasks.sort((left, right) => (left.dueDate ?? '9999').localeCompare(right.dueDate ?? '9999')),
			};
		});
	}

	/** The Monday of the week on show. */
	get week(): CalendarDate {
		return startOfWeek(this.period.anchor);
	}

	/** The days listed: the week without the weekdays hidden on this page. */
	get days(): CalendarDate[] {
		return this.period.shownDays;
	}

	on(date: CalendarDate): Appointment[] {
		return (this.resource.data?.appointments ?? []).filter((row) => toCalendarDate(row.start) === date);
	}

	minutesOn(date: CalendarDate): number {
		return this.on(date).reduce((sum, row) => sum + minutesBetween(row.start, row.end), 0);
	}
}
