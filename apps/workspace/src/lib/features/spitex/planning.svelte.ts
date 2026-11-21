import { toast } from 'svelte-sonner';
import {
	addDays,
	atTime,
	minutesToTime,
	today,
	toCalendarDate,
	weekDays,
	startOfWeek,
	minutesBetween,
} from '../../domain/dates.ts';
import type { UserId } from '../../domain/ids.ts';
import { planAssignments, withinArrivalWindow } from '../../domain/scheduling.ts';
import type { Appointment, CalendarDate, Contact } from '../../domain/types.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import type { Person } from '../collaboration/people.svelte.ts';

export interface PlanningData {
	visits: Appointment[];
	contacts: Map<string, Contact>;
}

/** The daily dispatch board for home-care visits. */
export class PlanningModel {
	readonly resource: Resource<PlanningData>;
	date = $state<CalendarDate>(today());
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['appointments', 'contacts'], async () => {
			const from = startOfWeek(this.date);
			const to = addDays(from, 6);
			const [visits, contacts] = await Promise.all([
				workspace.api.appointments.list(
					(row) => row.kind === 'spitex' && toCalendarDate(row.start) >= from && toCalendarDate(row.start) <= to,
				),
				workspace.api.contacts.list(),
			]);
			return { visits, contacts: new Map(contacts.map((contact) => [contact.id, contact])) };
		});
	}

	get day(): Appointment[] {
		return (this.resource.data?.visits ?? []).filter(
			(row) => toCalendarDate(row.start) === this.date && row.status !== 'cancelled',
		);
	}

	get open(): Appointment[] {
		return this.day
			.filter((row) => row.assigneeId === null)
			.sort((left, right) => left.start.localeCompare(right.start));
	}

	get week(): CalendarDate[] {
		return weekDays(startOfWeek(this.date), 7);
	}

	minutesFor(userId: UserId, date: CalendarDate): number {
		return (this.resource.data?.visits ?? [])
			.filter((row) => row.assigneeId === userId && toCalendarDate(row.start) === date && row.status !== 'cancelled')
			.reduce((sum, row) => sum + minutesBetween(row.start, row.end), 0);
	}

	openOn(date: CalendarDate): number {
		return (this.resource.data?.visits ?? []).filter(
			(row) => row.assigneeId === null && toCalendarDate(row.start) === date && row.status !== 'cancelled',
		).length;
	}

	setDate(date: CalendarDate) {
		const reload = startOfWeek(date) !== startOfWeek(this.date);
		this.date = date;
		if (reload) void this.resource.reload(true);
	}

	async assign(visit: Appointment, assigneeId: UserId | null, minutes: number | null) {
		const start = minutes === null ? visit.start : atTime(this.date, minutesToTime(minutes));
		const end = new Date(
			new Date(start).getTime() + (new Date(visit.end).getTime() - new Date(visit.start).getTime()),
		).toISOString();
		const outside = assigneeId !== null && !withinArrivalWindow(start, visit.arrivalWindow);
		this.resource.patch((data) => ({
			...data,
			visits: data.visits.map((row) => (row.id === visit.id ? { ...row, assigneeId, start, end } : row)),
		}));
		const saved = await this.#workspace.run(
			() => this.#workspace.api.appointments.update(visit.id, visit.revision, { assigneeId, start, end }),
			{
				success:
					assigneeId === null
						? 'ui.ws.spitex.unassigned'
						: outside
							? 'ui.ws.spitex.assigned_outside'
							: 'ui.ws.spitex.assigned',
				successParams: { title: visit.title },
			},
		);
		if (saved === null) void this.resource.reload(true);
	}

	async autoAssign(staff: readonly Person[]) {
		const plan = planAssignments(
			this.open,
			this.day,
			staff.map((person) => person.id),
			this.date,
		);
		if (plan.length === 0) {
			toast.info(this.#workspace.t('ui.ws.spitex.nothing_to_assign'));
			return;
		}
		const api = this.#workspace.api.appointments;
		await this.#workspace.run(
			async () => {
				for (const entry of plan) {
					const current = await api.get(entry.visit.id);
					const end = new Date(
						new Date(entry.start).getTime() + (new Date(current.end).getTime() - new Date(current.start).getTime()),
					).toISOString();
					await api.update(current.id, current.revision, { assigneeId: entry.assigneeId, start: entry.start, end });
				}
			},
			{
				success: 'ui.ws.spitex.auto_assigned',
				successParams: { count: plan.length, open: this.open.length - plan.length },
			},
		);
	}
}
