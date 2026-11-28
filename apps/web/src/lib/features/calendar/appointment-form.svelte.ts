import { toast } from 'svelte-sonner';
import { atTime, timeOfDay, toCalendarDate } from '@clinks/domain/dates';
import type { ContactId, UserId } from '@clinks/domain/ids';
import { conflictsFor, withinArrivalWindow } from '@clinks/domain/scheduling';
import type {
	Appointment,
	AppointmentKind,
	AppointmentStatus,
	CalendarDate,
	PhysioService,
	SpitexService,
} from '@clinks/domain/types';
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
	windowEnabled = $state(false);
	#services: Partial<Record<AppointmentKind, AppointmentFields['service']>> = {};
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
		this.windowEnabled = !!(this.value.windowFrom || this.value.windowTo);
		this.#services = {};
		this.#initial = JSON.stringify(this.value);
		this.fields = {};
	}

	changeKind(kind: AppointmentKind) {
		if (kind === this.value.kind) return;
		this.#services[this.value.kind] = this.value.service;
		this.value.kind = kind;
		this.value.service = this.#services[kind] ?? null;
	}

	get dropsService() {
		return Object.entries(this.#services).some(([kind, service]) => kind !== this.value.kind && !!service);
	}

	get dropsWindow() {
		const { kind, windowFrom, windowTo } = this.value;
		if (kind === 'spitex' || !(windowFrom || windowTo)) return false;
		const existing = this.original?.arrivalWindow;
		return kind !== this.original?.kind || windowFrom !== existing?.from || windowTo !== existing?.to;
	}

	removeWindow() {
		this.windowEnabled = false;
		this.value.windowFrom = '';
		this.value.windowTo = '';
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
		if (this.value.kind !== 'spitex' || !this.windowEnabled || !this.value.windowFrom || !this.value.windowTo)
			return false;
		return !withinArrivalWindow(this.startIso, { from: this.value.windowFrom, to: this.value.windowTo });
	}

	async save(): Promise<Appointment | null> {
		this.fields = {};
		const v = $state.snapshot(this.value);
		const withWindow = v.kind === 'spitex' && this.windowEnabled;
		if (withWindow) {
			if (!v.windowFrom) this.fields.windowFrom = this.#workspace.t('ui.ws.calendar.missing_earliest');
			if (!v.windowTo) this.fields.windowTo = this.#workspace.t('ui.ws.calendar.missing_latest');
			if (v.windowFrom && v.windowTo && v.windowTo < v.windowFrom)
				this.fields.windowTo = this.#workspace.t('ui.ws.calendar.window_order');
			if (Object.keys(this.fields).length) return null;
		}
		this.busy = true;
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
			arrivalWindow: withWindow
				? { from: v.windowFrom, to: v.windowTo }
				: this.original && this.original.kind === v.kind && v.kind !== 'spitex'
					? this.original.arrivalWindow
					: null,
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
