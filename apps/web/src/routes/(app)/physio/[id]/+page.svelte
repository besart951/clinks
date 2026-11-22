<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Plus from '@lucide/svelte/icons/plus';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Phone from '@lucide/svelte/icons/phone';
	import UserRound from '@lucide/svelte/icons/user-round';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import StatusBadge from '#lib/components/common/StatusBadge.svelte';
	import { invoiceTone } from '#lib/components/common/tones';
	import DetailHeader from '#lib/components/kit/DetailHeader.svelte';
	import Accordion from '@clinks/ui/kit/Accordion.svelte';
	import AccordionSection from '#lib/components/kit/AccordionSection.svelte';
	import AttributeList from '#lib/components/kit/AttributeList.svelte';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import PastToggle from '@clinks/ui/kit/PastToggle.svelte';
	import ProgressRing from '@clinks/ui/kit/ProgressRing.svelte';
	import SoapNote from '#lib/components/kit/SoapNote.svelte';
	import AppointmentRow from '#lib/components/kit/AppointmentRow.svelte';
	import { personBadge } from '@clinks/ui/kit/avatar';
	import { insuranceFields, patientMasterFields } from '#lib/features/physio/patient-fields';
	import AttachmentPanel from '#lib/components/collaboration/AttachmentPanel.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import { PatientRecordModel, activePrescription, prescriptionProgress } from '#lib/features/physio/physio.svelte';
	import { NoteForm, PrescriptionForm, SeriesForm } from '#lib/features/physio/physio-forms.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { effectiveStatus, invoiceTotals } from '@clinks/domain/money';
	import { ageOn, today } from '@clinks/domain/dates';
	import { physioServices, physioTariffs, type Prescription } from '@clinks/domain/types';
	import type { ContactId } from '@clinks/domain/ids';
	import { href, navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const id = page.params.id as ContactId;
	const model = new PatientRecordModel(workspace, id);
	const people = new PeopleDirectory(workspace);
	const prescriptionForm = new PrescriptionForm(workspace);
	const noteForm = new NoteForm(workspace);
	const seriesForm = new SeriesForm(workspace);
	const canWrite = $derived(session.can('physio.write'));
	const text = { t: workspace.t.bind(workspace), date: (value: string) => workspace.i18n.date(value) };
	let composing = $state(false);
	const soapLabels = {
		subjective: workspace.t('ui.ws.physio.subjective'),
		objective: workspace.t('ui.ws.physio.objective'),
		assessment: workspace.t('ui.ws.physio.assessment'),
		plan: workspace.t('ui.ws.physio.plan'),
	};
	let prescriptionOpen = $state(false);
	let seriesOpen = $state(false);
	const weekdays = [1, 2, 3, 4, 5, 6];

	onMount(() => {
		return model.resource.connect();
	});

	function editPrescription(prescription: Prescription | null) {
		prescriptionForm.start(id, prescription);
		prescriptionOpen = true;
	}

	async function savePrescription(event: SubmitEvent) {
		event.preventDefault();
		if (await prescriptionForm.save()) prescriptionOpen = false;
	}

	function openSeries(remaining: number) {
		seriesForm.start(remaining, session.user?.id ?? null);
		seriesOpen = true;
	}

	async function saveSeries(event: SubmitEvent) {
		event.preventDefault();
		const patient = model.resource.value.patient;
		if (await seriesForm.save(id, contactName(patient))) seriesOpen = false;
	}

	async function saveNote(event: SubmitEvent) {
		event.preventDefault();
		if (await noteForm.save(id)) composing = false;
	}
</script>

<svelte:head>
	<title
		>{model.resource.data ? contactName(model.resource.data.patient) : workspace.t('ui.ws.module.physio')} · CLinks</title
	>
</svelte:head>

<ModuleGate module="physio" permission="physio.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ patient, appointments, prescriptions, notes, invoices })}
			{@const active = activePrescription(prescriptions, patient.id)}
			{@const progress = active ? prescriptionProgress(active, appointments) : null}
			{@const now = new Date().toISOString()}
			{@const upcoming = appointments.filter((row) => row.start >= now).reverse()}
			{@const past = appointments.filter((row) => row.start < now)}
			{@const unbilled = appointments.filter(
				(row) => row.status === 'done' && row.billedInvoiceId === null && row.kind === 'physio',
			).length}
			<DetailHeader
				header={{
					title: contactName(patient),
					back: { label: workspace.t('ui.ws.physio.patients'), path: '/physio' },
					avatar: personBadge(contactName(patient)),
					meta: patient.birthDate
						? [workspace.t('ui.ws.inline.age', { years: ageOn(patient.birthDate, today()) })]
						: [],
					badges: [patient.insurer, patient.language?.toUpperCase() ?? ''].filter(Boolean),
				}}
			>
				{#snippet actions()}
					{#if patient.phone}<Button
							variant="ghost"
							size="icon-sm"
							href="tel:{patient.phone}"
							aria-label={patient.phone}
						>
							<Phone class="size-4" />
						</Button>{/if}
					<Button variant="outline" size="sm" href={href(`/contacts/${patient.id}`)}>
						<UserRound class="size-4" />{workspace.t('ui.ws.physio.contact_card')}
					</Button>
					{#if canWrite && session.can('calendar.write')}<Button
							variant="outline"
							size="sm"
							onclick={() => openSeries(progress?.remaining ?? 9)}
						>
							<CalendarRange class="size-4" />{workspace.t('ui.ws.physio.plan_series')}
						</Button>{/if}
					{#if session.hasModule('finance') && session.can('finance.write')}<Button
							size="sm"
							href={href(`/finance/invoices/new?contact=${patient.id}`)}
						>
							<ReceiptText class="size-4" />{unbilled > 0
								? workspace.t('ui.ws.physio.bill_count', { count: unbilled })
								: workspace.t('ui.ws.physio.bill_services')}
						</Button>{/if}
				{/snippet}
			</DetailHeader>

			<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<Accordion>
					<AccordionSection section={{ id: 'patient.master', title: workspace.t('ui.ws.contacts.master_data') }}>
						<AttributeList
							list={{ fields: patientMasterFields(patient, text), readonly: !canWrite }}
							onsave={(field, value) => model.saveField(patient, field.key, value, field.label)}
						/>
					</AccordionSection>
					<AccordionSection
						section={{
							id: 'patient.insurance',
							title: workspace.t('ui.ws.physio.insurance'),
							count: patient.insurer,
							defaultOpen: false,
						}}
					>
						<AttributeList
							list={{ fields: insuranceFields(patient, text), readonly: !canWrite }}
							onsave={(field, value) => model.saveField(patient, field.key, value, field.label)}
						/>
					</AccordionSection>
					<AccordionSection
						section={{
							id: 'patient.prescriptions',
							title: workspace.t('ui.ws.physio.prescriptions'),
							count: prescriptions.length,
						}}
					>
						{#snippet tools()}
							{#if canWrite}<Button variant="ghost" size="sm" onclick={() => editPrescription(null)}>
									<Plus class="size-4" />{workspace.t('ui.ws.physio.new_prescription')}
								</Button>{/if}
						{/snippet}
						<div class="grid gap-1">
							{#each prescriptions as prescription, index (prescription.id)}
								{@const state = prescriptionProgress(prescription, appointments)}
								{@const planned = appointments.filter(
									(row) => row.start >= now && row.status !== 'cancelled' && row.kind === 'physio',
								).length}
								<div
									class="rise reveal-scope hover:bg-accent grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-2"
									style:--i={index}
								>
									<ProgressRing value={state.used} max={prescription.sessionsPrescribed} />
									<div class="grid min-w-0 gap-0.5 text-sm">
										<div class="flex flex-wrap items-baseline gap-2">
											<b class="font-semibold">
												{workspace.t('ui.ws.physio.prescription_number', { number: prescriptions.length - index })}
											</b>
											<span class="text-muted-foreground text-[13px]">
												{workspace.i18n.date(prescription.issuedOn)}
											</span>
											{#if state.alert && state.alert !== 'none'}<StatusBadge
													tone={state.alert === 'expired' ? 'neutral' : 'warning'}
													label={workspace.t(`ui.ws.physio.alert_${state.alert}`)}
												/>{/if}
										</div>
										<span class="truncate">{prescription.diagnosis}</span>
										<span class="text-muted-foreground truncate text-[13px]">
											{prescription.doctor} · {workspace.t('ui.ws.physio.tariff', { tariff: prescription.tariff })} · {workspace.t(
												'ui.ws.physio.sessions_planned',
												{
													used: state.used,
													total: prescription.sessionsPrescribed,
													planned: index === 0 ? planned : 0,
												},
											)}
										</span>
									</div>
									{#if canWrite}<Button
											variant="ghost"
											size="icon-sm"
											class="reveal"
											aria-label={workspace.t('ui.ws.physio.edit_prescription')}
											onclick={() => editPrescription(prescription)}
										>
											<Pencil class="size-4" />
										</Button>{/if}
								</div>
							{:else}
								<p class="text-muted-foreground px-1 text-sm">{workspace.t('ui.ws.physio.alert_none')}</p>
							{/each}
						</div>
					</AccordionSection>
					<AccordionSection section={{ id: 'patient.documents', title: workspace.t('ui.ws.module.documents') }}>
						<AttachmentPanel target={{ kind: 'contact', id: patient.id }} />
					</AccordionSection>
					<AccordionSection
						section={{ id: 'patient.notes', title: workspace.t('ui.ws.physio.progress_notes'), count: notes.length }}
					>
						{#snippet tools()}
							{#if canWrite && !composing}<Button variant="ghost" size="sm" onclick={() => (composing = true)}>
									<Plus class="size-4" />{workspace.t('ui.ws.physio.note_for', {
										date: workspace.i18n.format(new Date(), { weekday: 'short', day: 'numeric', month: 'short' }),
									})}
								</Button>{/if}
						{/snippet}
						{#if composing}
							<form class="bg-sunken mb-2 grid gap-2 rounded-lg border p-3" onsubmit={saveNote}>
								{#each [['subjective', 'S'], ['objective', 'O'], ['assessment', 'A'], ['plan', 'P']] as const as [field, letter] (field)}
									<label class="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2">
										<span
											class="bg-muted text-muted-foreground mt-1.5 grid size-5 place-items-center rounded text-[11px] font-semibold"
											title={workspace.t(`ui.ws.physio.${field}`)}
										>
											{letter}
										</span>
										<Textarea
											rows={2}
											class="bg-field min-h-0"
											bind:value={noteForm[field]}
											placeholder={workspace.t(`ui.ws.physio.${field}`)}
											{@attach (node) => {
												if (field === 'subjective') node.focus();
											}}
										/>
									</label>
								{/each}
								<div class="flex items-center justify-end gap-2">
									<Input
										type="date"
										class="mr-auto h-8 w-40"
										bind:value={noteForm.date}
										aria-label={workspace.t('ui.ws.calendar.date')}
									/>
									<Button variant="ghost" size="sm" type="button" onclick={() => (composing = false)}>
										{workspace.t('ui.ws.cancel')}
									</Button>
									<Button size="sm" type="submit" disabled={noteForm.busy || noteForm.empty}>
										{workspace.t('ui.save')}
									</Button>
								</div>
							</form>
						{/if}
						<div class="grid">
							{#each notes as note, index (note.id)}
								<SoapNote
									{note}
									meta={{ author: people.get(note.authorId)?.name ?? '', labels: soapLabels, open: index === 0 }}
								/>
							{:else}
								{#if !composing}<p class="text-muted-foreground px-1 text-sm">
										{workspace.t('ui.ws.physio.no_notes')}
									</p>{/if}
							{/each}
						</div>
					</AccordionSection>
				</Accordion>

				<aside class="grid gap-4">
					<SideCard
						card={{
							title: workspace.t('ui.ws.contacts.upcoming'),
							count: upcoming.length,
							addLabel: workspace.t('ui.ws.command.new_appointment'),
						}}
						onadd={session.can('calendar.write') ? () => navigate(`/calendar?new=1&contact=${patient.id}`) : undefined}
					>
						<div class="grid">
							{#each upcoming as appointment, index (appointment.id)}<AppointmentRow {appointment} {index} />{:else}
								<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.contacts.no_appointments')}</p>
							{/each}
						</div>
						{#if past.length > 0}
							<PastToggle label={workspace.t('ui.ws.inline.past', { count: past.length })}>
								{#each past as appointment, index (appointment.id)}<AppointmentRow {appointment} {index} />{/each}
							</PastToggle>
						{/if}
					</SideCard>
					{#if session.hasModule('finance') && session.can('finance.read')}
						<SideCard card={{ title: workspace.t('ui.ws.command.group_invoices'), count: invoices.length }}>
							<div class="grid">
								{#each invoices as invoice (invoice.id)}
									{@const status = effectiveStatus(invoice, today())}
									<a
										class="hover:bg-accent grid h-10 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-1 text-[13px]"
										href={href(`/finance/invoices/${invoice.id}`)}
									>
										<span class="truncate">
											<b class="font-mono text-xs font-medium">{invoice.number}</b>
											<span class="text-muted-foreground">{workspace.i18n.date(invoice.issueDate)}</span>
										</span>
										<span class="tabular-nums">{workspace.i18n.money(invoiceTotals(invoice).gross)}</span>
										<StatusBadge tone={invoiceTone[status]} label={workspace.t(`ui.ws.invoice.status.${status}`)} />
									</a>
								{:else}
									<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.contacts.no_invoices')}</p>
								{/each}
							</div>
						</SideCard>
					{/if}
				</aside>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>

<Dialog.Root bind:open={prescriptionOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>
				{prescriptionForm.original
					? workspace.t('ui.ws.physio.edit_prescription')
					: workspace.t('ui.ws.physio.new_prescription')}
			</Dialog.Title>
		</Dialog.Header>
		<form id="prescription-form" class="space-y-3" onsubmit={savePrescription} novalidate>
			<FormField id="p-doctor" label={workspace.t('ui.ws.physio.doctor')} error={prescriptionForm.fields.doctor}>
				<Input
					id="p-doctor"
					bind:value={prescriptionForm.value.doctor}
					aria-invalid={!!prescriptionForm.fields.doctor}
				/>
			</FormField>
			<FormField
				id="p-diagnosis"
				label={workspace.t('ui.ws.physio.diagnosis')}
				error={prescriptionForm.fields.diagnosis}
			>
				<Input
					id="p-diagnosis"
					bind:value={prescriptionForm.value.diagnosis}
					aria-invalid={!!prescriptionForm.fields.diagnosis}
				/>
			</FormField>
			<div class="grid grid-cols-2 gap-3">
				<FormField id="p-tariff" label={workspace.t('ui.ws.physio.tariff_label')}>
					<Choice
						id="p-tariff"
						bind:value={prescriptionForm.value.tariff}
						options={physioTariffs.map((tariff) => ({
							value: tariff,
							label: workspace.t('ui.ws.physio.tariff', { tariff }),
						}))}
					/>
				</FormField>
				<FormField
					id="p-sessions"
					label={workspace.t('ui.ws.physio.sessions')}
					error={prescriptionForm.fields.sessionsPrescribed}
				>
					<Input
						id="p-sessions"
						type="number"
						min="1"
						max="36"
						bind:value={prescriptionForm.value.sessionsPrescribed}
					/>
				</FormField>
				<FormField id="p-issued" label={workspace.t('ui.ws.physio.issued_on')}>
					<Input id="p-issued" type="date" bind:value={prescriptionForm.value.issuedOn} />
				</FormField>
				<FormField id="p-valid" label={workspace.t('ui.ws.physio.valid_until_label')}>
					<Input id="p-valid" type="date" bind:value={prescriptionForm.value.validUntil} />
				</FormField>
			</div>
		</form>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (prescriptionOpen = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="prescription-form"
				disabled={prescriptionForm.busy}
			>
				{workspace.t('ui.save')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={seriesOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.physio.plan_series')}</Dialog.Title><Dialog.Description>
				{workspace.t('ui.ws.physio.series_text')}
			</Dialog.Description>
		</Dialog.Header>
		<form id="series-form" class="space-y-3" onsubmit={saveSeries}>
			<div class="grid grid-cols-3 gap-3">
				<FormField id="s-first" label={workspace.t('ui.ws.physio.first_date')}>
					<Input id="s-first" type="date" bind:value={seriesForm.firstDate} />
				</FormField>
				<FormField id="s-time" label={workspace.t('ui.ws.physio.time')}>
					<Input id="s-time" type="time" step="300" bind:value={seriesForm.time} />
				</FormField>
				<FormField id="s-count" label={workspace.t('ui.ws.physio.count')}>
					<Input id="s-count" type="number" min="1" max="36" bind:value={seriesForm.count} />
				</FormField>
			</div>
			<fieldset class="space-y-1.5">
				<legend class="text-sm font-medium">{workspace.t('ui.ws.physio.weekdays')}</legend>
				<div class="flex gap-1">
					{#each weekdays as day (day)}<Button
							type="button"
							size="sm"
							variant={seriesForm.weekdays.includes(day) ? 'default' : 'outline'}
							aria-pressed={seriesForm.weekdays.includes(day)}
							onclick={() => seriesForm.toggleWeekday(day)}
						>
							{workspace.i18n.format(new Date(2024, 0, day), { weekday: 'short' })}
						</Button>{/each}
				</div>
			</fieldset>
			<div class="grid grid-cols-2 gap-3">
				<FormField id="s-service" label={workspace.t('ui.ws.calendar.service')}>
					<Choice
						id="s-service"
						bind:value={seriesForm.service}
						options={physioServices.map((service) => ({
							value: service,
							label: workspace.t(`ui.ws.physio.service.${service}`),
						}))}
					/>
				</FormField>
				<FormField id="s-assignee" label={workspace.t('ui.ws.calendar.assignee')}>
					<Choice
						id="s-assignee"
						value={seriesForm.assigneeId ?? ''}
						options={people.people.map((person) => ({ value: person.id, label: person.name }))}
						onchange={(value) => (seriesForm.assigneeId = (value || null) as typeof seriesForm.assigneeId)}
					/>
				</FormField>
			</div>
			<p class="text-muted-foreground text-sm">
				{workspace.t('ui.ws.physio.series_preview', {
					count: seriesForm.preview.length,
					first: seriesForm.preview[0] ? workspace.i18n.dateTime(seriesForm.preview[0].start) : '—',
					last: seriesForm.preview.at(-1) ? workspace.i18n.date(seriesForm.preview.at(-1)!.start) : '—',
				})}
			</p>
		</form>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (seriesOpen = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="series-form"
				disabled={seriesForm.busy || seriesForm.preview.length === 0}
			>
				{workspace.t('ui.ws.physio.create_series')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
