import { toast } from 'svelte-sonner';
import { addDays, today } from '../../domain/dates.ts';
import { newId, type ContactId, type SeriesId, type UserId } from '../../domain/ids.ts';
import { seriesSlots } from '../../domain/scheduling.ts';
import type { ClinicalNote, PhysioService, PhysioTariff, Prescription } from '../../domain/types.ts';
import type { Draft } from '../../data/repository.ts';
import type { Workspace } from '../../workspace.svelte.ts';

abstract class Form {
	busy = $state(false);
	fields = $state<{ [field: string]: string }>({});
	protected workspace: Workspace;

	constructor(workspace: Workspace) {
		this.workspace = workspace;
	}

	protected async attempt(action: () => Promise<unknown>, success: string, params: { [name: string]: string | number } = {}): Promise<boolean> {
		this.busy = true;
		this.fields = {};
		try {
			await action();
			toast.success(this.workspace.t(success, params));
			return true;
		} catch (error) {
			this.fields = this.workspace.fieldErrors(error);
			if (Object.keys(this.fields).length === 0) toast.error(this.workspace.message(error));
			return false;
		} finally {
			this.busy = false;
		}
	}
}

export class PrescriptionForm extends Form {
	value = $state<Draft<Prescription>>({ contactId: '' as ContactId, doctor: '', diagnosis: '', tariff: '7301', sessionsPrescribed: 9, issuedOn: today(), validUntil: addDays(today(), 70) });
	original = $state.raw<Prescription | null>(null);

	start(contactId: ContactId, prescription: Prescription | null) {
		this.original = prescription;
		this.value = prescription
			? structuredClone($state.snapshot(prescription))
			: { contactId, doctor: '', diagnosis: '', tariff: '7301' as PhysioTariff, sessionsPrescribed: 9, issuedOn: today(), validUntil: addDays(today(), 70) };
		this.fields = {};
	}

	save() {
		const api = this.workspace.api.prescriptions;
		const draft = $state.snapshot(this.value) as Draft<Prescription>;
		return this.attempt(() => (this.original ? api.update(this.original.id, this.original.revision, draft) : api.create(draft)), 'ui.ws.physio.prescription_saved');
	}
}

export class NoteForm extends Form {
	date = $state(today());
	subjective = $state('');
	objective = $state('');
	assessment = $state('');
	plan = $state('');

	get empty() {
		return ![this.subjective, this.objective, this.assessment, this.plan].some((value) => value.trim());
	}

	async save(contactId: ContactId) {
		const ok = await this.attempt(
			() =>
				this.workspace.api.physioNotes.create({
					kind: 'physio',
					contactId,
					appointmentId: null,
					date: this.date,
					authorId: this.workspace.session.user!.id,
					subjective: this.subjective,
					objective: this.objective,
					assessment: this.assessment,
					plan: this.plan,
				} satisfies Draft<ClinicalNote>),
			'ui.ws.physio.note_saved',
		);
		if (ok) {
			this.subjective = '';
			this.objective = '';
			this.assessment = '';
			this.plan = '';
		}
		return ok;
	}
}

export class SeriesForm extends Form {
	firstDate = $state(addDays(today(), 1));
	time = $state('08:00');
	duration = $state(30);
	weekdays = $state<number[]>([1, 4]);
	count = $state(9);
	service = $state<PhysioService>('general');
	assigneeId = $state<UserId | null>(null);

	get preview() {
		return seriesSlots({ firstDate: this.firstDate, time: this.time, durationMinutes: this.duration, weekdays: this.weekdays, count: this.count });
	}

	toggleWeekday(day: number) {
		this.weekdays = this.weekdays.includes(day) ? this.weekdays.filter((candidate) => candidate !== day) : [...this.weekdays, day].sort();
	}

	start(remaining: number, assigneeId: UserId | null) {
		this.count = Math.max(remaining, 1);
		this.assigneeId = assigneeId;
		this.firstDate = addDays(today(), 1);
		this.fields = {};
	}

	save(contactId: ContactId, title: string) {
		const seriesId = newId<SeriesId>();
		const slots = this.preview;
		const api = this.workspace.api.appointments;
		return this.attempt(
			async () => {
				for (const slot of slots) {
					await api.create({
						title, kind: 'physio', status: 'planned', contactId, assigneeId: this.assigneeId, start: slot.start, end: slot.end,
						location: '', notes: '', seriesId, service: this.service, arrivalWindow: null, billedInvoiceId: null,
					});
				}
			},
			'ui.ws.physio.series_created',
			{ count: slots.length },
		);
	}
}
