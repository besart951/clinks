<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Plus from '@lucide/svelte/icons/plus';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserRound from '@lucide/svelte/icons/user-round';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import * as Dialog from '@clinks/ui-shared/components/ui/dialog';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import { Progress } from '@clinks/ui-shared/components/ui/progress';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import Choice from '$lib/components/common/Choice.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import { appointmentTone, invoiceTone } from '$lib/components/common/tones';
	import AttachmentPanel from '$lib/components/collaboration/AttachmentPanel.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import { PatientRecordModel, activePrescription, prescriptionProgress } from '$lib/features/physio/physio.svelte';
	import { NoteForm, PrescriptionForm, SeriesForm } from '$lib/features/physio/physio-forms.svelte';
	import { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import { effectiveStatus, invoiceTotals } from '$lib/domain/money';
	import { today } from '$lib/domain/dates';
	import { physioServices, physioTariffs, type Prescription } from '$lib/domain/types';
	import type { ContactId } from '$lib/domain/ids';
	import { href, routeQuery, setQuery } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const id = page.params.id as ContactId;
	const model = new PatientRecordModel(workspace, id);
	const people = new PeopleDirectory(workspace);
	const prescriptionForm = new PrescriptionForm(workspace);
	const noteForm = new NoteForm(workspace);
	const seriesForm = new SeriesForm(workspace);
	const canWrite = $derived(session.can('physio.write'));
	const tab = $derived(routeQuery(page.url).get('tab') ?? 'overview');
	let prescriptionOpen = $state(false);
	let seriesOpen = $state(false);
	const weekdays = [1, 2, 3, 4, 5, 6];

	onMount(() => {
		void people.load();
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
		await noteForm.save(id);
	}
</script>

<svelte:head
	><title
		>{model.resource.data ? contactName(model.resource.data.patient) : workspace.t('ui.ws.module.physio')} · CLinks</title
	></svelte:head
>

<ModuleGate module="physio" permission="physio.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ patient, appointments, prescriptions, notes, invoices })}
			{@const active = activePrescription(prescriptions, patient.id)}
			{@const progress = active ? prescriptionProgress(active, appointments) : null}
			<PageHeader
				title={contactName(patient)}
				description={[patient.birthDate ? workspace.i18n.date(patient.birthDate) : '', patient.insurer, patient.phone]
					.filter(Boolean)
					.join(' · ')}
				crumbs={[{ label: workspace.t('ui.ws.physio.patients'), path: '/physio' }, { label: contactName(patient) }]}
			>
				{#snippet actions()}
					<Button variant="outline" href={href(`/contacts/${patient.id}`)}
						><UserRound class="size-4" />{workspace.t('ui.ws.physio.contact_card')}</Button
					>
					{#if canWrite && session.can('calendar.write')}<Button
							variant="outline"
							onclick={() => openSeries(progress?.remaining ?? 9)}
							><CalendarRange class="size-4" />{workspace.t('ui.ws.physio.plan_series')}</Button
						>{/if}
					{#if session.hasModule('finance') && session.can('finance.write')}<Button
							href={href(`/finance/invoices/new?contact=${patient.id}`)}
							><ReceiptText class="size-4" />{workspace.t('ui.ws.physio.bill_services')}</Button
						>{/if}
				{/snippet}
			</PageHeader>

			<Tabs.Root
				value={tab}
				onValueChange={(value) => setQuery(page.url, { tab: value === 'overview' ? null : value })}
			>
				<Tabs.List class="mb-4 max-w-full overflow-x-auto">
					<Tabs.Trigger value="overview">{workspace.t('ui.ws.contacts.tab_overview')}</Tabs.Trigger>
					<Tabs.Trigger value="notes">{workspace.t('ui.ws.physio.progress_notes')} ({notes.length})</Tabs.Trigger>
					<Tabs.Trigger value="prescriptions"
						>{workspace.t('ui.ws.physio.prescriptions')} ({prescriptions.length})</Tabs.Trigger
					>
					<Tabs.Trigger value="appointments"
						>{workspace.t('ui.ws.command.group_appointments')} ({appointments.length})</Tabs.Trigger
					>
					{#if session.hasModule('finance') && session.can('finance.read')}<Tabs.Trigger value="invoices"
							>{workspace.t('ui.ws.command.group_invoices')} ({invoices.length})</Tabs.Trigger
						>{/if}
					<Tabs.Trigger value="documents">{workspace.t('ui.ws.module.documents')}</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="overview">
					<div class="grid gap-4 lg:grid-cols-3">
						<Card.Root>
							<Card.Header><Card.Title>{workspace.t('ui.ws.physio.active_prescription')}</Card.Title></Card.Header>
							<Card.Content class="space-y-3 text-sm">
								{#if active && progress}
									<p class="font-medium">{active.diagnosis}</p>
									<p class="text-muted-foreground">
										{active.doctor} · {workspace.t('ui.ws.physio.tariff', { tariff: active.tariff })}
									</p>
									<Progress
										value={(progress.used / active.sessionsPrescribed) * 100}
										aria-label={workspace.t('ui.ws.physio.sessions_used', {
											used: progress.used,
											total: active.sessionsPrescribed,
										})}
									/>
									<p>
										{workspace.t('ui.ws.physio.sessions_used', {
											used: progress.used,
											total: active.sessionsPrescribed,
										})} · {workspace.t('ui.ws.physio.valid_until', { date: workspace.i18n.date(active.validUntil) })}
									</p>
									{#if progress.alert}<StatusBadge
											tone="warning"
											label={workspace.t(`ui.ws.physio.alert_${progress.alert}`)}
										/>{/if}
								{:else}
									<p class="text-muted-foreground">{workspace.t('ui.ws.physio.alert_none')}</p>
									{#if canWrite}<Button size="sm" onclick={() => editPrescription(null)}
											><Plus class="size-4" />{workspace.t('ui.ws.physio.new_prescription')}</Button
										>{/if}
								{/if}
							</Card.Content>
						</Card.Root>
						<Card.Root>
							<Card.Header><Card.Title>{workspace.t('ui.ws.physio.latest_note')}</Card.Title></Card.Header>
							<Card.Content class="space-y-1 text-sm">
								{#if notes[0]}
									<p class="text-muted-foreground text-xs">
										{workspace.i18n.date(notes[0].date)} · {people.get(notes[0].authorId)?.name ?? ''}
									</p>
									<p><span class="font-medium">S</span> {notes[0].subjective}</p>
									<p><span class="font-medium">P</span> {notes[0].plan}</p>
								{:else}<p class="text-muted-foreground">{workspace.t('ui.ws.physio.no_notes')}</p>{/if}
							</Card.Content>
						</Card.Root>
						<Card.Root>
							<Card.Header><Card.Title>{workspace.t('ui.ws.physio.next_appointments')}</Card.Title></Card.Header>
							<Card.Content>
								<ul class="space-y-1 text-sm">
									{#each appointments
										.filter((row) => row.start >= new Date().toISOString() && row.status !== 'cancelled')
										.reverse()
										.slice(0, 5) as appointment (appointment.id)}
										<li class="flex justify-between gap-2">
											<a
												class="hover:underline"
												href={href(`/calendar?date=${appointment.start.slice(0, 10)}&appointment=${appointment.id}`)}
												>{workspace.i18n.dateTime(appointment.start)}</a
											><span class="text-muted-foreground"
												>{people.get(appointment.assigneeId)?.name.split(' ')[0] ?? ''}</span
											>
										</li>
									{:else}<li class="text-muted-foreground">{workspace.t('ui.ws.contacts.no_appointments')}</li>{/each}
								</ul>
							</Card.Content>
						</Card.Root>
					</div>
				</Tabs.Content>

				<Tabs.Content value="notes">
					<div class="grid gap-6 lg:grid-cols-[1fr_24rem]">
						<ol class="space-y-3">
							{#each notes as note (note.id)}
								<li class="rounded-xl border p-4 text-sm">
									<div class="mb-2 flex items-center gap-2 text-xs">
										<span class="font-medium">{workspace.i18n.date(note.date)}</span><span class="text-muted-foreground"
											>{people.get(note.authorId)?.name ?? ''}</span
										>{#if canWrite && note.authorId === session.user?.id}<button
												class="text-muted-foreground hover:text-destructive ml-auto"
												onclick={() => model.removeNote(note)}
												aria-label={workspace.t('ui.ws.delete')}><Trash2 class="size-3.5" /></button
											>{/if}
									</div>
									<dl class="grid gap-1 sm:grid-cols-[1.5rem_1fr]">
										<dt class="font-semibold">S</dt>
										<dd>{note.subjective || '—'}</dd>
										<dt class="font-semibold">O</dt>
										<dd>{note.objective || '—'}</dd>
										<dt class="font-semibold">A</dt>
										<dd>{note.assessment || '—'}</dd>
										<dt class="font-semibold">P</dt>
										<dd>{note.plan || '—'}</dd>
									</dl>
								</li>
							{:else}<li class="text-muted-foreground text-sm">{workspace.t('ui.ws.physio.no_notes')}</li>{/each}
						</ol>
						{#if canWrite}
							<Card.Root class="h-fit">
								<Card.Header
									><Card.Title>{workspace.t('ui.ws.physio.new_note')}</Card.Title><Card.Description
										>{workspace.t('ui.ws.physio.soap_hint')}</Card.Description
									></Card.Header
								>
								<Card.Content>
									<form class="space-y-3" onsubmit={saveNote}>
										<FormField id="n-date" label={workspace.t('ui.ws.calendar.date')}
											><Input id="n-date" type="date" bind:value={noteForm.date} /></FormField
										>
										<FormField id="n-s" label={workspace.t('ui.ws.physio.subjective')}
											><Textarea
												id="n-s"
												rows={2}
												bind:value={noteForm.subjective}
												placeholder={workspace.t('ui.ws.physio.subjective_placeholder')}
											/></FormField
										>
										<FormField id="n-o" label={workspace.t('ui.ws.physio.objective')}
											><Textarea
												id="n-o"
												rows={2}
												bind:value={noteForm.objective}
												placeholder={workspace.t('ui.ws.physio.objective_placeholder')}
											/></FormField
										>
										<FormField id="n-a" label={workspace.t('ui.ws.physio.assessment')}
											><Textarea id="n-a" rows={2} bind:value={noteForm.assessment} /></FormField
										>
										<FormField id="n-p" label={workspace.t('ui.ws.physio.plan')}
											><Textarea
												id="n-p"
												rows={2}
												bind:value={noteForm.plan}
												placeholder={workspace.t('ui.ws.physio.plan_placeholder')}
											/></FormField
										>
										<Button type="submit" class="w-full" disabled={noteForm.busy || noteForm.empty}
											>{workspace.t('ui.save')}</Button
										>
									</form>
								</Card.Content>
							</Card.Root>
						{/if}
					</div>
				</Tabs.Content>

				<Tabs.Content value="prescriptions">
					{#if canWrite}<Button class="mb-3" onclick={() => editPrescription(null)}
							><Plus class="size-4" />{workspace.t('ui.ws.physio.new_prescription')}</Button
						>{/if}
					<ul class="divide-y rounded-xl border">
						{#each prescriptions as prescription (prescription.id)}
							{@const state = prescriptionProgress(prescription, appointments)}
							<li class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
								<div class="min-w-0 flex-1">
									<p class="font-medium">{prescription.diagnosis}</p>
									<p class="text-muted-foreground">
										{prescription.doctor} · {workspace.i18n.date(prescription.issuedOn)} – {workspace.i18n.date(
											prescription.validUntil,
										)} · {workspace.t('ui.ws.physio.tariff', { tariff: prescription.tariff })}
									</p>
								</div>
								<span class="tabular-nums">{state.used}/{prescription.sessionsPrescribed}</span>
								{#if state.alert}<StatusBadge
										tone={state.alert === 'expired' ? 'neutral' : 'warning'}
										label={workspace.t(`ui.ws.physio.alert_${state.alert}`)}
									/>{/if}
								{#if canWrite}<Button variant="ghost" size="sm" onclick={() => editPrescription(prescription)}
										>{workspace.t('ui.ws.edit')}</Button
									>{/if}
							</li>
						{:else}<li class="text-muted-foreground px-4 py-6 text-center text-sm">
								{workspace.t('ui.ws.physio.alert_none')}
							</li>{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="appointments">
					<ul class="divide-y rounded-xl border">
						{#each appointments as appointment (appointment.id)}
							<li class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
								<a
									class="w-40 tabular-nums hover:underline"
									href={href(`/calendar?date=${appointment.start.slice(0, 10)}&appointment=${appointment.id}`)}
									>{workspace.i18n.dateTime(appointment.start)}</a
								>
								<span class="flex-1"
									>{appointment.service
										? workspace.t(`ui.ws.physio.service.${appointment.service}`)
										: appointment.title}</span
								>
								<span class="text-muted-foreground">{people.get(appointment.assigneeId)?.name ?? ''}</span>
								{#if appointment.billedInvoiceId}<StatusBadge
										tone="success"
										label={workspace.t('ui.ws.calendar.billed')}
									/>{/if}
								<StatusBadge
									tone={appointmentTone[appointment.status]}
									label={workspace.t(`ui.ws.appointment.status.${appointment.status}`)}
								/>
							</li>
						{:else}<li class="text-muted-foreground px-4 py-6 text-center text-sm">
								{workspace.t('ui.ws.contacts.no_appointments')}
							</li>{/each}
					</ul>
				</Tabs.Content>

				<Tabs.Content value="invoices">
					<ul class="divide-y rounded-xl border">
						{#each invoices as invoice (invoice.id)}
							{@const status = effectiveStatus(invoice, today())}
							<li class="flex items-center gap-3 px-4 py-2.5 text-sm">
								<a class="w-28 font-medium hover:underline" href={href(`/finance/invoices/${invoice.id}`)}
									>{invoice.number}</a
								><span class="text-muted-foreground flex-1">{workspace.i18n.date(invoice.issueDate)}</span><span
									class="tabular-nums">{workspace.i18n.money(invoiceTotals(invoice).gross)}</span
								><StatusBadge tone={invoiceTone[status]} label={workspace.t(`ui.ws.invoice.status.${status}`)} />
							</li>
						{:else}<li class="text-muted-foreground px-4 py-6 text-center text-sm">
								{workspace.t('ui.ws.contacts.no_invoices')}
							</li>{/each}
					</ul>
				</Tabs.Content>
				<Tabs.Content value="documents"><AttachmentPanel target={{ kind: 'contact', id: patient.id }} /></Tabs.Content>
			</Tabs.Root>
		{/snippet}
	</AsyncView>
</ModuleGate>

<Dialog.Root bind:open={prescriptionOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		<Dialog.Header
			><Dialog.Title
				>{prescriptionForm.original
					? workspace.t('ui.ws.physio.edit_prescription')
					: workspace.t('ui.ws.physio.new_prescription')}</Dialog.Title
			></Dialog.Header
		>
		<form id="prescription-form" class="space-y-3" onsubmit={savePrescription} novalidate>
			<FormField id="p-doctor" label={workspace.t('ui.ws.physio.doctor')} error={prescriptionForm.fields.doctor}
				><Input
					id="p-doctor"
					bind:value={prescriptionForm.value.doctor}
					aria-invalid={!!prescriptionForm.fields.doctor}
				/></FormField
			>
			<FormField
				id="p-diagnosis"
				label={workspace.t('ui.ws.physio.diagnosis')}
				error={prescriptionForm.fields.diagnosis}
				><Input
					id="p-diagnosis"
					bind:value={prescriptionForm.value.diagnosis}
					aria-invalid={!!prescriptionForm.fields.diagnosis}
				/></FormField
			>
			<div class="grid grid-cols-2 gap-3">
				<FormField id="p-tariff" label={workspace.t('ui.ws.physio.tariff_label')}
					><Choice
						id="p-tariff"
						bind:value={prescriptionForm.value.tariff}
						options={physioTariffs.map((tariff) => ({
							value: tariff,
							label: workspace.t('ui.ws.physio.tariff', { tariff }),
						}))}
					/></FormField
				>
				<FormField
					id="p-sessions"
					label={workspace.t('ui.ws.physio.sessions')}
					error={prescriptionForm.fields.sessionsPrescribed}
					><Input
						id="p-sessions"
						type="number"
						min="1"
						max="36"
						bind:value={prescriptionForm.value.sessionsPrescribed}
					/></FormField
				>
				<FormField id="p-issued" label={workspace.t('ui.ws.physio.issued_on')}
					><Input id="p-issued" type="date" bind:value={prescriptionForm.value.issuedOn} /></FormField
				>
				<FormField id="p-valid" label={workspace.t('ui.ws.physio.valid_until_label')}
					><Input id="p-valid" type="date" bind:value={prescriptionForm.value.validUntil} /></FormField
				>
			</div>
		</form>
		<Dialog.Footer
			><Button variant="outline" onclick={() => (prescriptionOpen = false)}>{workspace.t('ui.ws.cancel')}</Button
			><Button type="submit" form="prescription-form" disabled={prescriptionForm.busy}>{workspace.t('ui.save')}</Button
			></Dialog.Footer
		>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={seriesOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		<Dialog.Header
			><Dialog.Title>{workspace.t('ui.ws.physio.plan_series')}</Dialog.Title><Dialog.Description
				>{workspace.t('ui.ws.physio.series_text')}</Dialog.Description
			></Dialog.Header
		>
		<form id="series-form" class="space-y-3" onsubmit={saveSeries}>
			<div class="grid grid-cols-3 gap-3">
				<FormField id="s-first" label={workspace.t('ui.ws.physio.first_date')}
					><Input id="s-first" type="date" bind:value={seriesForm.firstDate} /></FormField
				>
				<FormField id="s-time" label={workspace.t('ui.ws.physio.time')}
					><Input id="s-time" type="time" step="300" bind:value={seriesForm.time} /></FormField
				>
				<FormField id="s-count" label={workspace.t('ui.ws.physio.count')}
					><Input id="s-count" type="number" min="1" max="36" bind:value={seriesForm.count} /></FormField
				>
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
							>{workspace.i18n.format(new Date(2024, 0, day), { weekday: 'short' })}</Button
						>{/each}
				</div>
			</fieldset>
			<div class="grid grid-cols-2 gap-3">
				<FormField id="s-service" label={workspace.t('ui.ws.calendar.service')}
					><Choice
						id="s-service"
						bind:value={seriesForm.service}
						options={physioServices.map((service) => ({
							value: service,
							label: workspace.t(`ui.ws.physio.service.${service}`),
						}))}
					/></FormField
				>
				<FormField id="s-assignee" label={workspace.t('ui.ws.calendar.assignee')}
					><Choice
						id="s-assignee"
						value={seriesForm.assigneeId ?? ''}
						options={people.people.map((person) => ({ value: person.id, label: person.name }))}
						onchange={(value) => (seriesForm.assigneeId = (value || null) as typeof seriesForm.assigneeId)}
					/></FormField
				>
			</div>
			<p class="text-muted-foreground text-sm">
				{workspace.t('ui.ws.physio.series_preview', {
					count: seriesForm.preview.length,
					first: seriesForm.preview[0] ? workspace.i18n.dateTime(seriesForm.preview[0].start) : '—',
					last: seriesForm.preview.at(-1) ? workspace.i18n.date(seriesForm.preview.at(-1)!.start) : '—',
				})}
			</p>
		</form>
		<Dialog.Footer
			><Button variant="outline" onclick={() => (seriesOpen = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="series-form"
				disabled={seriesForm.busy || seriesForm.preview.length === 0}
				>{workspace.t('ui.ws.physio.create_series')}</Button
			></Dialog.Footer
		>
	</Dialog.Content>
</Dialog.Root>
