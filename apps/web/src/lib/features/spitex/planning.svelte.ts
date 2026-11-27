import { saveTimes, type AppointmentTimes } from '../calendar/retime.ts';
import { toast } from 'svelte-sonner';
import { addDays, atTime, minutesToTime, toCalendarDate, startOfWeek, minutesBetween } from '@clinks/domain/dates';
import type { UserId } from '@clinks/domain/ids';
import { planAssignments, withinArrivalWindow } from '@clinks/domain/scheduling';
import type { Appointment, CalendarDate, Contact, WeekRelease } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import { CalendarPeriod } from '../calendar/calendar-period.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';
import type { Person } from '../collaboration/people.svelte.ts';

export interface PlanningData {
	visits: Appointment[];
	contacts: Map<string, Contact>;
	/** The release of the week on show, if it is released to the staff. */
	release: WeekRelease | null;
}

/** The daily dispatch board for home-care visits. */
export class PlanningModel {
	readonly resource: Resource<PlanningData>;
	/** One day on show; the whole week is loaded (the week strip, the release). */
	readonly period: CalendarPeriod;
	/** Staff columns hidden from the plan; their visits stay assigned. */
	hiddenPeople = $state<UserId[]>([]);
	#workspace: Workspace;

	#loadedWeek: CalendarDate | null = null;

	constructor(workspace: Workspace, anchor?: CalendarDate) {
		this.#workspace = workspace;
		this.period = new CalendarPeriod({
			units: ['day'],
			jumps: ['day', 'week'],
			anchor,
			weekdays: { key: 'spitex', preferences: workspace.platform.preferences },
			onchange: () => {
				if (this.#loadedWeek !== startOfWeek(this.date)) void this.resource.reload(true);
			},
		});
		this.resource = new Resource(workspace.db, ['appointments', 'contacts', 'weekReleases'], async () => {
			const from = (this.#loadedWeek = startOfWeek(this.date));
			const to = addDays(from, 6);
			const [visits, contacts, releases] = await Promise.all([
				workspace.api.appointments.list(
					(row) => row.kind === 'spitex' && toCalendarDate(row.start) >= from && toCalendarDate(row.start) <= to,
				),
				workspace.api.contacts.list(),
				workspace.api.weekReleases.list((row) => row.weekStart === from),
			]);
			return {
				visits,
				contacts: new Map(contacts.map((contact) => [contact.id, contact])),
				release: releases[0] ?? null,
			};
		});
	}

	get date(): CalendarDate {
		return this.period.anchor;
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

	get weekStart(): CalendarDate {
		return startOfWeek(this.date);
	}

	get release(): WeekRelease | null {
		return this.resource.data?.release ?? null;
	}

	/** What a release shows to whom: planned visits, the people they go to, and visits nobody has yet. */
	get weekSummary(): { visits: number; people: number; open: number } {
		const planned = (this.resource.data?.visits ?? []).filter((row) => row.status !== 'cancelled');
		const assigned = planned.filter((row) => row.assigneeId !== null);
		return {
			visits: assigned.length,
			people: new Set(assigned.map((row) => row.assigneeId)).size,
			open: planned.length - assigned.length,
		};
	}

	/** Planned or changed after the week was released: the person has seen an earlier plan. */
	changedSinceRelease(visit: Appointment): boolean {
		return this.release !== null && visit.updatedAt > this.release.createdAt;
	}

	/** Shows the week to the staff: everyone sees their own visits. */
	async releaseWeek(week: number) {
		const releasedBy = this.#workspace.session.user?.id;
		if (!releasedBy || this.release) return;
		await this.#workspace.run(
			() => this.#workspace.api.weekReleases.create({ weekStart: this.weekStart, releasedBy }),
			{ success: 'ui.ws.spitex.release.released', successParams: { week } },
		);
	}

	/** Takes the week back: it is a draft again and leaves the staff's devices. */
	async withdrawRelease(week: number) {
		const release = this.release;
		if (!release) return;
		await this.#workspace.run(() => this.#workspace.api.weekReleases.remove(release.id), {
			success: 'ui.ws.spitex.release.withdrawn',
			successParams: { week },
		});
	}

	togglePerson(id: UserId) {
		this.hiddenPeople = this.hiddenPeople.includes(id)
			? this.hiddenPeople.filter((candidate) => candidate !== id)
			: [...this.hiddenPeople, id];
	}

	/** The week strip: the week of the day on show, without the weekdays hidden here. */
	get week(): CalendarDate[] {
		return this.period.withoutHidden(this.period.week);
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
		this.period.setAnchor(date);
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

	/** New start and end after resizing on the grid; shown at once, saved in the background. */
	async retime(visit: Appointment, times: AppointmentTimes) {
		if (times.start === visit.start && times.end === visit.end) return;
		this.resource.patch((data) => ({
			...data,
			visits: data.visits.map((row) => (row.id === visit.id ? { ...row, ...times } : row)),
		}));
		if ((await saveTimes(this.#workspace, visit, times)) === null) void this.resource.reload(true);
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
