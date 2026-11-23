import type { Appointment, Timestamp } from '@clinks/domain/types';
import type { Workspace } from '../../workspace.svelte.ts';

export interface AppointmentTimes {
	start: Timestamp;
	end: Timestamp;
}

/**
 * Saves a new start and end for an appointment (after resizing it on the grid) with an undo toast.
 * The caller has already shown the new times; it reloads when this returns null.
 */
export function saveTimes(workspace: Workspace, appointment: Appointment, times: AppointmentTimes) {
	const api = workspace.api.appointments;
	return workspace.run(() => api.update(appointment.id, appointment.revision, times), {
		success: 'ui.ws.calendar.retimed',
		successParams: { title: appointment.title },
		undo: async () => {
			const current = await api.get(appointment.id);
			return api.update(current.id, current.revision, { start: appointment.start, end: appointment.end });
		},
	});
}
