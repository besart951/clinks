import { minutesOfDay } from './dates.ts';
import type { Appointment } from './types.ts';

export interface PositionedAppointment {
	appointment: Appointment;
	top: number;
	height: number;
	lane: number;
	lanes: number;
}

/**
 * Places a day's appointments in side-by-side lanes so overlapping ones stay readable.
 * `top` and `height` are in minutes from `dayStart`.
 */
export function layoutDay(appointments: readonly Appointment[], dayStart: number, dayEnd: number): PositionedAppointment[] {
	const sorted = [...appointments].sort((left, right) => left.start.localeCompare(right.start) || right.end.localeCompare(left.end));
	const result: PositionedAppointment[] = [];
	let cluster: PositionedAppointment[] = [];
	let laneEnds: number[] = [];
	let clusterEnd = -1;
	const close = () => {
		for (const item of cluster) item.lanes = laneEnds.length;
		cluster = [];
		laneEnds = [];
	};
	for (const appointment of sorted) {
		const start = Math.max(minutesOfDay(appointment.start), dayStart);
		const end = Math.min(Math.max(minutesOfDay(appointment.end), start + 15), dayEnd);
		if (start >= clusterEnd) close();
		let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(end);
		} else laneEnds[lane] = end;
		clusterEnd = Math.max(clusterEnd, end);
		const item = { appointment, top: start - dayStart, height: end - start, lane, lanes: 1 };
		cluster.push(item);
		result.push(item);
	}
	close();
	return result;
}
