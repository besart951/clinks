import { addDays, atTime, isoWeekday, minutesOfDay, timeOfDay } from './dates.ts';
import type { Appointment, ArrivalWindow, CalendarDate } from './types.ts';
import type { AppointmentId, UserId } from './ids.ts';

type Slot = Pick<Appointment, 'id' | 'start' | 'end' | 'assigneeId' | 'status'>;

export function overlaps(left: Pick<Appointment, 'start' | 'end'>, right: Pick<Appointment, 'start' | 'end'>): boolean {
	return new Date(left.start) < new Date(right.end) && new Date(right.start) < new Date(left.end);
}

/** Active appointments of the same person that collide with the candidate. */
export function conflictsFor(candidate: Slot, others: readonly Slot[]): Slot[] {
	if (!candidate.assigneeId) return [];
	return others.filter(
		(other) =>
			other.id !== candidate.id &&
			other.assigneeId === candidate.assigneeId &&
			other.status !== 'cancelled' &&
			overlaps(candidate, other),
	);
}

function toMinutes(value: string) {
	const [hours, minutes] = value.split(':').map(Number);
	return hours * 60 + minutes;
}

export function withinArrivalWindow(start: string, window: ArrivalWindow | null): boolean {
	if (!window) return true;
	const value = minutesOfDay(start);
	return value >= toMinutes(window.from) && value <= toMinutes(window.to);
}

export interface SeriesRequest {
	firstDate: CalendarDate;
	time: string;
	durationMinutes: number;
	weekdays: number[];
	count: number;
}

/** Dates and times for a treatment series on the chosen ISO weekdays (1 = Monday). */
export function seriesSlots(request: SeriesRequest): { start: string; end: string }[] {
	const slots: { start: string; end: string }[] = [];
	if (request.weekdays.length === 0 || request.count <= 0) return slots;
	let date = request.firstDate;
	for (let guard = 0; slots.length < request.count && guard < 366; guard++) {
		if (request.weekdays.includes(isoWeekday(date))) {
			const start = atTime(date, request.time);
			slots.push({ start, end: new Date(new Date(start).getTime() + request.durationMinutes * 60_000).toISOString() });
		}
		date = addDays(date, 1);
	}
	return slots;
}

/** Earliest start for a visit inside its arrival window that does not collide with the staff member's day. */
export function firstFreeStart(
	visit: Pick<Appointment, 'start' | 'end' | 'arrivalWindow'>,
	date: CalendarDate,
	assigneeId: UserId,
	day: readonly Slot[],
): string | null {
	const duration = (new Date(visit.end).getTime() - new Date(visit.start).getTime()) / 60_000;
	const window = visit.arrivalWindow ?? { from: timeOfDay(visit.start), to: timeOfDay(visit.start) };
	for (let minutes = toMinutes(window.from); minutes <= toMinutes(window.to); minutes += 5) {
		const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
		const start = atTime(date, `${hours}:${String(minutes % 60).padStart(2, '0')}`);
		const end = new Date(new Date(start).getTime() + duration * 60_000).toISOString();
		const candidate = { id: 'candidate' as AppointmentId, start, end, assigneeId, status: 'planned' as const };
		if (conflictsFor(candidate, day).length === 0) return start;
	}
	return null;
}
