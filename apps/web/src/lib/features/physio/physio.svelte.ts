import { addDays, daysBetween, today } from '@clinks/domain/dates';
import type { ContactId } from '@clinks/domain/ids';
import type { Appointment, ClinicalNote, Contact, Invoice, Prescription } from '@clinks/domain/types';
import { contactPatch } from '../contacts/contact-fields.ts';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export const patientTag = 'Patient:in';

export type PrescriptionAlert = 'none' | 'expiring' | 'almost_used' | 'expired';

export interface PrescriptionProgress {
	prescription: Prescription;
	used: number;
	remaining: number;
	alert: PrescriptionAlert | null;
}

/** Sessions used on a prescription: finished appointments since it was issued. */
export function prescriptionProgress(
	prescription: Prescription,
	appointments: readonly Appointment[],
	on: string = today(),
): PrescriptionProgress {
	const used = appointments.filter(
		(appointment) =>
			appointment.contactId === prescription.contactId &&
			appointment.kind === 'physio' &&
			appointment.status !== 'cancelled' &&
			appointment.start.slice(0, 10) >= prescription.issuedOn &&
			appointment.start.slice(0, 10) <= on,
	).length;
	const remaining = Math.max(prescription.sessionsPrescribed - used, 0);
	const alert: PrescriptionAlert | null =
		prescription.validUntil < on
			? 'expired'
			: remaining <= 2
				? 'almost_used'
				: daysBetween(on, prescription.validUntil) <= 14
					? 'expiring'
					: null;
	return { prescription, used, remaining, alert };
}

export function activePrescription(
	prescriptions: readonly Prescription[],
	contactId: ContactId,
	on: string = today(),
): Prescription | null {
	return (
		[...prescriptions]
			.filter((row) => row.contactId === contactId && row.validUntil >= on)
			.sort((left, right) => right.issuedOn.localeCompare(left.issuedOn))[0] ?? null
	);
}

export interface PatientRow {
	patient: Contact;
	next: Appointment | null;
	last: Appointment | null;
	progress: PrescriptionProgress | null;
	alert: PrescriptionAlert | null;
}

/** All patients with their next appointment and prescription status. */
export class PatientsModel {
	readonly resource: Resource<PatientRow[]>;
	search = $state('');
	filter = $state<'all' | 'alerts' | 'week'>('all');

	constructor(workspace: Workspace) {
		this.resource = new Resource(workspace.db, ['contacts', 'appointments', 'prescriptions'], async () => {
			const [contacts, appointments, prescriptions] = await Promise.all([
				workspace.api.contacts.list((row) => row.tags.includes(patientTag) && !row.archived),
				workspace.api.appointments.list((row) => row.kind === 'physio'),
				workspace.api.prescriptions.list(),
			]);
			const now = new Date().toISOString();
			return contacts.map((patient) => {
				const own = appointments
					.filter((row) => row.contactId === patient.id && row.status !== 'cancelled')
					.sort((left, right) => left.start.localeCompare(right.start));
				const active = activePrescription(prescriptions, patient.id);
				const progress = active ? prescriptionProgress(active, appointments) : null;
				return {
					patient,
					next: own.find((row) => row.start >= now) ?? null,
					last: [...own].reverse().find((row) => row.start < now) ?? null,
					progress,
					alert: progress ? progress.alert : 'none',
				};
			});
		});
	}

	get rows(): PatientRow[] {
		const query = this.search.trim().toLowerCase();
		const weekEnd = addDays(today(), 7);
		return (this.resource.data ?? [])
			.filter(
				(row) =>
					!query ||
					`${row.patient.firstName} ${row.patient.lastName} ${row.patient.insurer} ${row.patient.phone}`
						.toLowerCase()
						.includes(query),
			)
			.filter(
				(row) =>
					this.filter === 'all' ||
					(this.filter === 'alerts' ? row.alert !== null : row.next !== null && row.next.start.slice(0, 10) <= weekEnd),
			)
			.sort((left, right) => left.patient.lastName.localeCompare(right.patient.lastName, 'de'));
	}
}

export interface PatientRecord {
	patient: Contact;
	appointments: Appointment[];
	prescriptions: Prescription[];
	notes: ClinicalNote[];
	invoices: Invoice[];
}

/** One patient's record: prescriptions, progress notes, appointments and invoices. */
export class PatientRecordModel {
	readonly resource: Resource<PatientRecord>;
	#workspace: Workspace;

	constructor(workspace: Workspace, id: ContactId) {
		this.#workspace = workspace;
		const { api, session } = workspace;
		this.resource = new Resource(
			workspace.db,
			['contacts', 'appointments', 'prescriptions', 'notes', 'invoices'],
			async () => {
				const [patient, appointments, prescriptions, notes, invoices] = await Promise.all([
					api.contacts.get(id),
					api.appointments.list((row) => row.contactId === id),
					api.prescriptions.list((row) => row.contactId === id),
					api.physioNotes.list((row) => row.contactId === id && row.kind === 'physio'),
					session.can('finance.read') && session.hasModule('finance')
						? api.invoices.list((row) => row.contactId === id)
						: Promise.resolve([]),
				]);
				return {
					patient,
					appointments: appointments.sort((left, right) => right.start.localeCompare(left.start)),
					prescriptions: prescriptions.sort((left, right) => right.issuedOn.localeCompare(left.issuedOn)),
					notes: notes.sort(
						(left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt),
					),
					invoices: invoices.sort((left, right) => right.issueDate.localeCompare(left.issueDate)),
				};
			},
		);
	}

	saveField(patient: Contact, key: string, value: string, label: string) {
		return this.#workspace.patch(this.#workspace.api.contacts, patient, contactPatch(key, value), label);
	}
}
