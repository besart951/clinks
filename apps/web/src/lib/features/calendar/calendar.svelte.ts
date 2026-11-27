import { saveTimes, type AppointmentTimes } from './retime.ts';
import { addDays, minutesBetween, startOfWeek } from '@clinks/domain/dates';
import { CalendarPeriod } from './calendar-period.svelte.ts';
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

/** Calendar state: which range is shown (through the shared period), whose appointments, and moving them around. */
export class CalendarModel {
	readonly resource: Resource<CalendarData>;
	readonly period: CalendarPeriod;
	hiddenPeople = $state<UserId[]>([]);
	hiddenKinds = $state<AppointmentKind[]>([]);
	showOpen = $state(true);
	/** The team view: one day, a column per person. */
	#team = $state(false);
	/** The days loaded: the whole week in day and team view, so another day of it needs nothing new. */
	#loaded: readonly [CalendarDate, CalendarDate] | null = null;
	readonly #onview: ((view: CalendarView) => void) | undefined;
	#workspace: Workspace;

	constructor(
		workspace: Workspace,
		start: { view?: CalendarView; anchor?: CalendarDate; onview?: (view: CalendarView) => void } = {},
	) {
		this.#workspace = workspace;
		this.#onview = start.onview;
		this.#team = start.view === 'resources';
		this.period = new CalendarPeriod({
			units: ['day', 'week', 'month'],
			unit: start.view === 'resources' ? 'day' : (start.view ?? 'week'),
			anchor: start.anchor,
			weekdays: { key: 'calendar', preferences: workspace.platform.preferences },
			onunit: (unit) => {
				if (unit !== 'day') this.#team = false;
				this.#onview?.(this.view);
			},
			onchange: () => {
				const [from, to] = this.loadedRange;
				if (!this.#loaded || from < this.#loaded[0] || to > this.#loaded[1]) void this.resource.reload(true);
			},
		});
		this.resource = new Resource(workspace.db, ['appointments', 'contacts'], async () => {
			const [from, to] = (this.#loaded = this.loadedRange);
			const [appointments, contacts] = await Promise.all([
				workspace.api.appointments.list(
					(row) => row.start.slice(0, 10) >= addDays(from, -1) && row.start.slice(0, 10) <= addDays(to, 1),
				),
				workspace.session.can('contacts.read') ? workspace.api.contacts.list() : Promise.resolve([]),
			]);
			return { appointments, contacts: new Map(contacts.map((contact) => [contact.id, contact])) };
		});
	}

	get view(): CalendarView {
		return this.#team && this.period.unit === 'day' ? 'resources' : this.period.unit;
	}

	setView(view: CalendarView) {
		const unit = view === 'resources' ? 'day' : view;
		this.#team = view === 'resources';
		// A new unit reports itself through the period; day ↔ team view keeps the unit.
		if (unit === this.period.unit) this.#onview?.(this.view);
		else this.period.setUnit(unit);
	}

	get anchor(): CalendarDate {
		return this.period.anchor;
	}

	get loadedRange(): readonly [CalendarDate, CalendarDate] {
		if (this.period.unit !== 'day') return this.period.range;
		const monday = startOfWeek(this.period.anchor);
		return [monday, addDays(monday, 6)];
	}

	/** At a glance for one day: appointments, booked time and visits nobody has yet. */
	daySummary(date: CalendarDate): { count: number; minutes: number; open: number } {
		const rows = this.on(date).filter((row) => row.status !== 'cancelled');
		return {
			count: rows.length,
			minutes: rows.reduce((sum, row) => sum + minutesBetween(row.start, row.end), 0),
			open: rows.filter((row) => row.assigneeId === null).length,
		};
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

	/** New start and end after resizing on the grid; shown at once, saved in the background. */
	async retime(appointment: Appointment, times: AppointmentTimes) {
		if (times.start === appointment.start && times.end === appointment.end) return;
		this.resource.patch((data) => ({
			...data,
			appointments: data.appointments.map((row) => (row.id === appointment.id ? { ...row, ...times } : row)),
		}));
		if ((await saveTimes(this.#workspace, appointment, times)) === null) void this.resource.reload(true);
	}
}
