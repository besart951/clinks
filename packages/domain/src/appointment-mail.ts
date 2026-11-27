import type { Appointment, Contact } from './types.ts';

/** Settings › E-Mail › Termine. Everything is off until the workspace turns it on. */
export interface AppointmentMailSettings {
	/** A confirmation when an appointment is made or moved. */
	confirmation: boolean;
	/** A reminder `hoursBefore` the start. */
	reminder: boolean;
	hoursBefore: number;
	/** The workspace's own lines, e.g. where to park or what to bring. */
	text: string;
	/** Spitex visits too: only for clients whose «Erinnerungen» are on, with the arrival window instead of a time. */
	spitexVisits: boolean;
}

export const defaultAppointmentMail: AppointmentMailSettings = {
	confirmation: false,
	reminder: false,
	hoursBefore: 24,
	text: '',
	spitexVisits: false,
};

/** Whether this appointment gets mails at all: a contact with an address who wants them, not cancelled. */
export function mailable(
	appointment: Pick<Appointment, 'status' | 'kind'>,
	contact: (Pick<Contact, 'email' | 'archived'> & { reminders?: boolean | null }) | null,
	settings: AppointmentMailSettings,
): boolean {
	if (!contact?.email || contact.archived || contact.reminders === false) return false;
	if (appointment.status === 'cancelled') return false;
	return appointment.kind !== 'spitex' || settings.spitexVisits;
}

/** When the reminder is due (absolute hours, so a DST change in between does not shift it), or null. */
export function reminderDue(start: string, settings: AppointmentMailSettings): Date | null {
	if (!settings.reminder) return null;
	return new Date(new Date(start).getTime() - settings.hoursBefore * 3_600_000);
}

/**
 * Date and time for the mail, in the workspace's time zone: «Dienstag, 3. März 2026» and «10:30», or for a Spitex
 * visit the arrival window «zwischen 08:00 und 10:00» (the window's times are local already).
 */
export function appointmentWhen(
	appointment: Pick<Appointment, 'start' | 'arrivalWindow'>,
	timeZone: string,
	locale: string,
): { date: string; time: string | null; window: { from: string; to: string } | null } {
	const start = new Date(appointment.start);
	const date = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone,
	}).format(start);
	if (appointment.arrivalWindow) return { date, time: null, window: appointment.arrivalWindow };
	const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(
		start,
	);
	return { date, time, window: null };
}
