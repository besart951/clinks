import { toast } from 'svelte-sonner';
import { atTime, timeOfDay, toCalendarDate } from '../../domain/dates.ts';
import type { ContactId, UserId } from '../../domain/ids.ts';
import { conflictsFor, withinArrivalWindow } from '../../domain/scheduling.ts';
import type {
	Appointment,
	AppointmentKind,
	AppointmentStatus,
	CalendarDate,
	PhysioService,
	SpitexService,
} from '../../domain/types.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export interface AppointmentFields {
	title: string;
	kind: AppointmentKind;
	status: AppointmentStatus;
	contactId: ContactId | null;
	assigneeId: UserId | null;
	date: CalendarDate;
	startTime: string;
	endTime: string;
	location: string;
	notes: string;
	service: PhysioService | SpitexService | null;
	windowFrom: string;
	windowTo: string;
}

function blankFields(): AppointmentFields {
	return {
		title: '',
		kind: 'meeting',
		status: 'planned',
		contactId: null,
		assigneeId: null,
		date: toCalendarDate(new Date()),
		startTime: '09:00',
		endTime: '09:30',
		location: '',
		notes: '',
		service: null,
		windowFrom: '',
		windowTo: '',
	};
}

function fieldsFrom(appointment: Appointment): AppointmentFields {
	return {
		title: appointment.title,
		kind: appointment.kind,
		status: appointment.status,
		contactId: appointment.contactId,
		assigneeId: appointment.assigneeId,
		date: toCalendarDate(appointment.start),
		startTime: timeOfDay(appointment.start),
		endTime: timeOfDay(appointment.end),
		location: appointment.location,
		notes: appointment.notes,
		service: appointment.service,
		windowFrom: appointment.arrivalWindow?.from ?? '',
		windowTo: appointment.arrivalWindow?.to ?? '',
	};
}

/** Create or edit an appointment, with live conflict and arrival-window checks. */
export class AppointmentFormModel {
	value = $state<AppointmentFields>(blankFields());
	original = $state.raw<Appointment | null>(null);
	busy = $state(false);
	fields = $state<{ [field: string]: string }>({});
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(JSON.stringify(this.value) !== this.#initial);

	constructor(workspace: Workspace) {
		this.#workspace = workspace;
	}

	start(appointment: Appointment | null, preset: Partial<AppointmentFields> = {}) {
		this.original = appointment;
		const defaults: AppointmentFields = {
			...blankFields(),
			kind: this.#defaultKind(),
			assigneeId: this.#workspace.session.user?.id ?? null,
		};
		this.value = appointment ? fieldsFrom(appointment) : { ...defaults, ...preset };
		this.#initial = JSON.stringify(this.value);
		this.fields = {};
	}

	get startIso() {
		return atTime(this.value.date, this.value.startTime || '00:00');
	}

	get endIso() {
		return atTime(this.value.date, this.value.endTime || '00:00');
	}

	conflicts(others: readonly Appointment[]): Appointment[] {
		const candidate = {
			id: this.original?.id ?? ('new' as Appointment['id']),
			start: this.startIso,
			end: this.endIso,
			assigneeId: this.value.assigneeId,
			status: this.value.status,
		};
		return conflictsFor(candidate, others) as Appointment[];
	}

	get outsideWindow(): boolean {
		if (!this.value.windowFrom || !this.value.windowTo) return false;
		return !withinArrivalWindow(this.startIso, { from: this.value.windowFrom, to: this.value.windowTo });
	}

	async save(): Promise<Appointment | null> {
		this.busy = true;
		this.fields = {};
		const v = $state.snapshot(this.value);
		const draft = {
			title: v.title,
			kind: v.kind,
			status: v.status,
			contactId: v.contactId,
			assigneeId: v.assigneeId,
			start: this.startIso,
			end: this.endIso,
			location: v.location,
			notes: v.notes,
			service: v.service,
			arrivalWindow: v.windowFrom && v.windowTo ? { from: v.windowFrom, to: v.windowTo } : null,
		};
		const api = this.#workspace.api;
		try {
			const saved = this.original
				? await api.appointments.update(this.original.id, this.original.revision, draft)
				: await api.appointments.create({ ...draft, seriesId: null, billedInvoiceId: null });
			if (saved.assigneeId && saved.assigneeId !== this.original?.assigneeId) {
				await api.notify(
					[saved.assigneeId],
					'appointment',
					{
						key: 'ui.ws.notification.appointment_assigned',
						params: { target: `${saved.title} (${this.#workspace.i18n.dateTime(saved.start)})` },
					},
					`/calendar?date=${toCalendarDate(saved.start)}&appointment=${saved.id}`,
				);
			}
			this.#initial = JSON.stringify(this.value);
			toast.success(this.#workspace.t('ui.ws.calendar.saved'));
			return saved;
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) toast.error(this.#workspace.message(error));
			return null;
		} finally {
			this.busy = false;
		}
	}

	async remove(): Promise<boolean> {
		const original = this.original;
		if (!original) return false;
		const api = this.#workspace.api.appointments;
		const result = await this.#workspace.run(() => api.remove(original.id), {
			success: 'ui.ws.calendar.deleted',
			undo: () => api.restore(original),
		});
		return result !== null;
	}

	#defaultKind(): AppointmentKind {
		const session = this.#workspace.session;
		if (session.hasModule('physio') && session.tenant?.industry === 'physio') return 'physio';
		if (session.hasModule('spitex') && session.tenant?.industry === 'spitex') return 'spitex';
		return 'meeting';
	}
}
