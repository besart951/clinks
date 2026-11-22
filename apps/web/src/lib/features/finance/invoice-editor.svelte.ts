import { toast } from 'svelte-sonner';
import { addDays, today } from '@clinks/domain/dates';
import type { AppointmentId, ContactId, InvoiceId } from '@clinks/domain/ids';
import { invoiceTotals, nextInvoiceNumber } from '@clinks/domain/money';
import type { Appointment, Contact, Invoice, InvoiceLine, PhysioService, VatRate } from '@clinks/domain/types';
import { Resource } from '../../state/resource.svelte.ts';
import type { Workspace } from '../../workspace.svelte.ts';

export const physioTariffLines: { [service in PhysioService]: InvoiceLine } = {
	general: { description: 'Tarifposition 7301 · Allgemeine Physiotherapie', quantity: 1, unitPrice: 5328, vatRate: 0 },
	complex: { description: 'Tarifposition 7311 · Aufwändige Physiotherapie', quantity: 1, unitPrice: 8436, vatRate: 0 },
	home: { description: 'Tarifposition 7350 · Domizilbehandlung', quantity: 1, unitPrice: 3774, vatRate: 0 },
	initial: { description: 'Tarifposition 7301 · Erstbefund', quantity: 1, unitPrice: 5328, vatRate: 0 },
};

export interface EditorData {
	contacts: Contact[];
	invoices: Invoice[];
	appointments: Appointment[];
	invoice: Invoice | null;
}

/** Creating or editing a draft invoice, optionally from finished, unbilled appointments. */
export class InvoiceEditorModel {
	readonly resource: Resource<EditorData>;
	contactId = $state<ContactId | null>(null);
	issueDate = $state(today());
	paymentDays = $state(30);
	lines = $state<InvoiceLine[]>([{ description: '', quantity: 1, unitPrice: 0, vatRate: 810 }]);
	notes = $state('');
	appointmentIds = $state<AppointmentId[]>([]);
	busy = $state(false);
	fields = $state<{ [field: string]: string }>({});
	#initial = $state('');
	#workspace: Workspace;

	dirty = $derived(
		JSON.stringify([this.contactId, this.issueDate, this.paymentDays, this.lines, this.notes]) !== this.#initial,
	);
	totals = $derived(invoiceTotals({ lines: this.lines, payments: [] }));

	constructor(
		workspace: Workspace,
		id: InvoiceId | null,
		preset: { contactId: ContactId | null; appointmentId: AppointmentId | null },
	) {
		this.#workspace = workspace;
		this.resource = new Resource(workspace.db, ['contacts'], async () => {
			const [contacts, invoices, appointments, invoice] = await Promise.all([
				workspace.api.contacts.list(),
				workspace.api.invoices.list(),
				workspace.session.can('calendar.read')
					? workspace.api.appointments.list(
							(row) => row.billedInvoiceId === null && row.contactId !== null && row.status !== 'cancelled',
						)
					: Promise.resolve([]),
				id ? workspace.api.invoices.get(id) : Promise.resolve(null),
			]);
			if (this.#initial === '') this.#prepare(invoice, preset, appointments);
			return { contacts, invoices, appointments, invoice };
		});
	}

	/** The draft as the recipient will see it; the preview updates with every keystroke. */
	preview(draftLabel: string): Invoice {
		const data = this.resource.data;
		const base = data?.invoice;
		return {
			id: (base?.id ?? 'preview') as InvoiceId,
			tenantId: base?.tenantId ?? this.#workspace.session.tenantId!,
			revision: base?.revision ?? 0,
			createdAt: base?.createdAt ?? new Date().toISOString(),
			updatedAt: base?.updatedAt ?? new Date().toISOString(),
			number: base?.number ?? draftLabel,
			kind: 'invoice',
			contactId: this.contactId as ContactId,
			issueDate: this.issueDate,
			dueDate: addDays(this.issueDate, this.paymentDays),
			status: 'draft',
			lines: this.lines.filter((line) => line.description || line.unitPrice),
			payments: base?.payments ?? [],
			reminderLevel: 0,
			notes: this.notes,
			appointmentIds: this.appointmentIds,
		} as Invoice;
	}

	get unbilled(): Appointment[] {
		return (this.resource.data?.appointments ?? [])
			.filter((appointment) => appointment.contactId === this.contactId && new Date(appointment.start) < new Date())
			.sort((left, right) => left.start.localeCompare(right.start));
	}

	addLine(
		line: InvoiceLine = { description: '', quantity: 1, unitPrice: 0, vatRate: this.lines.at(-1)?.vatRate ?? 810 },
	) {
		this.lines = [...this.lines.filter((existing) => existing.description || existing.unitPrice), { ...line }];
	}

	removeLine(index: number) {
		this.lines = this.lines.filter((_, position) => position !== index);
	}

	setPrice(index: number, francs: string) {
		this.lines[index].unitPrice = Math.round(Number(francs.replace(',', '.').replace(/[^\d.-]/g, '')) * 100) || 0;
	}

	setVat(index: number, rate: string) {
		this.lines[index].vatRate = Number(rate) as VatRate;
	}

	addAppointment(appointment: Appointment) {
		if (this.appointmentIds.includes(appointment.id)) return;
		this.appointmentIds = [...this.appointmentIds, appointment.id];
		this.addLine(this.#lineFor(appointment));
	}

	async save(issue: boolean): Promise<Invoice | null> {
		const data = this.resource.data;
		if (!data) return null;
		this.busy = true;
		this.fields = {};
		const api = this.#workspace.api;
		const draft = {
			contactId: this.contactId as ContactId,
			issueDate: this.issueDate,
			dueDate: addDays(this.issueDate, this.paymentDays),
			lines: $state.snapshot(this.lines).filter((line) => line.description || line.unitPrice),
			notes: this.notes,
			appointmentIds: [...this.appointmentIds],
			status: issue ? ('open' as const) : ('draft' as const),
		};
		try {
			const saved = data.invoice
				? await api.invoices.update(data.invoice.id, data.invoice.revision, draft)
				: await api.invoices.create({
						...draft,
						number: this.#workspace.sync
							? ''
							: nextInvoiceNumber(data.invoices, new Date(this.issueDate).getFullYear()),
						kind: 'invoice',
						payments: [],
						reminderLevel: 0,
					});
			if (issue) {
				for (const appointment of data.appointments.filter((row) => this.appointmentIds.includes(row.id))) {
					await api.appointments.update(appointment.id, appointment.revision, {
						billedInvoiceId: saved.id,
						status: 'done',
					});
				}
			}
			this.#initial = this.#snapshot();
			toast.success(
				this.#workspace.t(issue ? 'ui.ws.invoice.issued' : 'ui.ws.invoice.draft_saved', { number: saved.number }),
			);
			return saved;
		} catch (error) {
			this.fields = this.#workspace.fieldErrors(error);
			toast.error(this.#workspace.message(error));
			return null;
		} finally {
			this.busy = false;
		}
	}

	#prepare(
		invoice: Invoice | null,
		preset: { contactId: ContactId | null; appointmentId: AppointmentId | null },
		appointments: Appointment[],
	) {
		if (invoice) {
			this.contactId = invoice.contactId;
			this.issueDate = invoice.issueDate;
			this.lines = structuredClone(invoice.lines);
			this.notes = invoice.notes;
			this.appointmentIds = [...invoice.appointmentIds];
		} else {
			const appointment = appointments.find((row) => row.id === preset.appointmentId);
			this.contactId = appointment?.contactId ?? preset.contactId;
			if (appointment) {
				this.appointmentIds = [appointment.id];
				this.lines = [this.#lineFor(appointment)];
			}
		}
		this.#initial = this.#snapshot();
	}

	#snapshot() {
		return JSON.stringify([this.contactId, this.issueDate, this.paymentDays, this.lines, this.notes]);
	}

	#lineFor(appointment: Appointment): InvoiceLine {
		const date = this.#workspace.i18n.date(appointment.start);
		if (appointment.kind === 'physio' && appointment.service && appointment.service in physioTariffLines) {
			const tariff = physioTariffLines[appointment.service as PhysioService];
			return { ...tariff, description: `${tariff.description} (${date})` };
		}
		const hours = (new Date(appointment.end).getTime() - new Date(appointment.start).getTime()) / 3_600_000;
		return {
			description: `${appointment.title} (${date})`,
			quantity: Math.round(hours * 100) / 100,
			unitPrice: appointment.kind === 'spitex' ? 7680 : 12000,
			vatRate: appointment.kind === 'spitex' ? 0 : 810,
		};
	}
}
