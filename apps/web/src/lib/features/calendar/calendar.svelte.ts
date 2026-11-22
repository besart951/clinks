import { addDays, addMonths, monthGrid, startOfWeek, today, weekDays } from '@clinks/domain/dates';
import type { AppointmentId, UserId } from '@clinks/domain/ids';
import type { Appointment, AppointmentKind, CalendarDate, Contact } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export type CalendarView = 'day' | 'week' | 'month' | 'resources';

export const dayStartMinutes = 7 * 60;
export const dayEndMinutes = 20 * 60;

export interface CalendarData {
	appointments: Appointment[];
	contacts: Map<string, Contact>;
}

/** Calendar state: which range is shown, whose appointments, and moving them around. */
export class CalendarModel {
	readonly resource: Resource<CalendarData>;
	view = $state<CalendarView>('week');
	anchor = $state<CalendarDate>(today());
	hiddenPeople = $state<UserId[]>([]);
	hiddenKinds = $state<AppointmentKind[]>([]);
	showOpen = $state(true);
	#workspace: Workspace;

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['appointments', 'contacts'], async () => {
			const [from, to] = this.range;
			const [appointments, contacts] = await Promise.all([
				workspace.api.appointments.list(
					(row) => row.start.slice(0, 10) >= addDays(from, -1) && row.start.slice(0, 10) <= addDays(to, 1),
				),
				workspace.session.can('contacts.read') ? workspace.api.contacts.list() : Promise.resolve([]),
			]);
			return { appointments, contacts: new Map(contacts.map((contact) => [contact.id, contact])) };
		});
	}

	get days(): CalendarDate[] {
		if (this.view === 'month') return monthGrid(this.anchor);
		if (this.view === 'week') return weekDays(startOfWeek(this.anchor), 7);
		return [this.anchor];
	}

	get range(): [CalendarDate, CalendarDate] {
		const days = this.days;
		return [days[0], days[days.length - 1]];
	}

	get visible(): Appointment[] {
		return (this.resource.data?.appointments ?? []).filter(
			(row) =>
				!this.hiddenKinds.includes(row.kind) &&
				(row.assigneeId === null ? this.showOpen : !this.hiddenPeople.includes(row.assigneeId)),
		);
	}

	on(date: CalendarDate, assigneeId?: UserId | null): Appointment[] {
		return this.visible.filter(
			(row) =>
				new Date(row.start).toDateString() === new Date(`${date}T12:00:00`).toDateString() &&
				(assigneeId === undefined || row.assigneeId === assigneeId),
		);
	}

	go(direction: -1 | 0 | 1) {
		if (direction === 0) this.anchor = today();
		else if (this.view === 'month') this.anchor = addMonths(this.anchor, direction);
		else this.anchor = addDays(this.anchor, direction * (this.view === 'week' ? 7 : 1));
		void this.resource.reload(true);
	}

	setView(view: CalendarView) {
		this.view = view;
		void this.resource.reload(true);
	}

	setAnchor(date: CalendarDate) {
		this.anchor = date;
		void this.resource.reload(true);
	}

	togglePerson(id: UserId) {
		this.hiddenPeople = this.hiddenPeople.includes(id)
			? this.hiddenPeople.filter((candidate) => candidate !== id)
			: [...this.hiddenPeople, id];
	}

	toggleKind(kind: AppointmentKind) {
		this.hiddenKinds = this.hiddenKinds.includes(kind)
			? this.hiddenKinds.filter((candidate) => candidate !== kind)
			: [...this.hiddenKinds, kind];
	}

	find(id: AppointmentId | string | null): Appointment | null {
		return this.resource.data?.appointments.find((row) => row.id === id) ?? null;
	}

	/** Moves an appointment to a new start (and optionally person), keeping its duration. */
	async move(appointment: Appointment, start: Date, assigneeId: UserId | null = appointment.assigneeId) {
		const duration = new Date(appointment.end).getTime() - new Date(appointment.start).getTime();
		const patch = { start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString(), assigneeId };
		if (patch.start === appointment.start && assigneeId === appointment.assigneeId) return;
		this.resource.patch((data) => ({
			...data,
			appointments: data.appointments.map((row) => (row.id === appointment.id ? { ...row, ...patch } : row)),
		}));
		const saved = await this.#workspace.run(
			() => this.#workspace.api.appointments.update(appointment.id, appointment.revision, patch),
			{
				success: 'ui.ws.calendar.moved',
				successParams: { title: appointment.title },
				undo: async () => {
					const current = await this.#workspace.api.appointments.get(appointment.id);
					return this.#workspace.api.appointments.update(current.id, current.revision, {
						start: appointment.start,
						end: appointment.end,
						assigneeId: appointment.assigneeId,
					});
				},
			},
		);
		if (saved === null) void this.resource.reload(true);
	}
}
