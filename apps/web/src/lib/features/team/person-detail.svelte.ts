import { addDays, minutesBetween, startOfWeek, today, toCalendarDate, weekDays } from '@clinks/domain/dates';
import type { UserId } from '@clinks/domain/ids';
import type { Appointment, CalendarDate, Task } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface PersonWeek {
	appointments: Appointment[];
	tasks: Task[];
}

/** What one staff member has on: appointments of a week, open tasks and how full each day is. */
export class PersonDetailModel {
	readonly resource: Resource<PersonWeek>;
	week = $state<CalendarDate>(startOfWeek(today()));

	constructor(workspace: Workspace, id: UserId) {
		const { api, session } = workspace;
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

	get days(): CalendarDate[] {
		return weekDays(this.week, 7);
	}

	on(date: CalendarDate): Appointment[] {
		return (this.resource.data?.appointments ?? []).filter((row) => toCalendarDate(row.start) === date);
	}

	minutesOn(date: CalendarDate): number {
		return this.on(date).reduce((sum, row) => sum + minutesBetween(row.start, row.end), 0);
	}

	moveWeek(direction: -1 | 1) {
		this.week = addDays(this.week, direction * 7);
		void this.resource.reload(true);
	}
}
