<script lang="ts">
	import MapLink from '#lib/components/common/MapLink.svelte';
	import { streetLine } from '@clinks/domain/address';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import UserRound from '@lucide/svelte/icons/user-round';
	import XIcon from '@lucide/svelte/icons/x';
	import { MediaQuery } from 'svelte/reactivity';
	import * as Sheet from '@clinks/ui/components/ui/sheet';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import ContactPicker from '#lib/components/common/ContactPicker.svelte';
	import ConfirmDialog, { type ConfirmRequest } from '#lib/components/common/ConfirmDialog.svelte';
	import { AppointmentFormModel, type AppointmentFields } from '#lib/features/calendar/appointment-form.svelte';
	import type { Person } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import {
		appointmentKinds,
		physioServices,
		spitexServices,
		type Appointment,
		type Contact,
	} from '@clinks/domain/types';
	import { href, navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		contacts,
		people,
		appointments,
		onSaved,
		docked = false,
		selectedId = $bindable(null),
	}: {
		contacts: Contact[];
		people: Person[];
		appointments: Appointment[];
		onSaved?: (appointment: Appointment) => void;
		/**
		 * Wide screens: a non-modal panel in the page's own layout (the page places it beside its content), so the
		 * rest stays usable. Narrow screens, or without `docked`: a modal sheet over the page.
		 */
		docked?: boolean;
		/** The appointment shown, so the page can highlight it. */
		selectedId?: string | null;
	} = $props();

	const workspace = useWorkspace();
	const session = workspace.session;
	const form = new AppointmentFormModel(workspace);
	let open = $state(false);
	const wide = new MediaQuery('min-width: 64rem');
	const inline = $derived(docked && wide.current);
	let panel = $state<HTMLDialogElement>();

	// The panel is a native non-modal dialog: shown in place (not the top layer), closed by the browser, which
	// also returns focus to whatever opened it.
	$effect(() => {
		if (!panel) return;
		if (open && !panel.open) {
			panel.show();
			panel.querySelector<HTMLElement>('#a-title')?.focus();
		} else if (!open && panel.open) panel.close();
	});
	$effect(() => {
		selectedId = open ? (form.original?.id ?? null) : null;
	});

	/** The panel ends at the window's bottom edge, like the grid beside it; only its form scrolls. */
	let panelHeight = $state<number | null>(null);
	$effect(() => {
		if (!panel || !open) return;
		const measure = () => {
			const top = panel!.getBoundingClientRect().top + scrollY;
			panelHeight = Math.max(320, innerHeight - top - 24);
		};
		measure();
		addEventListener('resize', measure);
		return () => removeEventListener('resize', measure);
	});
	let confirm = $state<ConfirmRequest | null>(null);
	const canWrite = $derived(session.can('calendar.write'));
	const conflicts = $derived(open ? form.conflicts(appointments) : []);
	const contact = $derived(contacts.find((candidate) => candidate.id === form.value.contactId) ?? null);

	export function show(appointment: Appointment | null, preset: Partial<AppointmentFields> = {}) {
		const load = () => {
			form.start(appointment, preset);
			open = true;
		};
		// The docked panel leaves the calendar usable: switching to another appointment must not drop edits.
		if (open && form.dirty && canWrite) confirmDiscard(load);
		else load();
	}

	function confirmDiscard(then: () => void) {
		confirm = {
			title: workspace.t('ui.ws.unsaved.title'),
			description: workspace.t('ui.ws.unsaved.text'),
			confirmLabel: workspace.t('ui.ws.unsaved.discard'),
			destructive: true,
			onConfirm: then,
		};
	}

	function close(next: boolean) {
		if (next) return;
		if (!form.dirty || !canWrite) {
			open = false;
			return;
		}
		confirmDiscard(() => (open = false));
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const saved = await form.save();
		if (saved) {
			open = false;
			onSaved?.(saved);
		}
	}

	function askDelete() {
		confirm = {
			title: workspace.t('ui.ws.calendar.delete_title'),
			description: workspace.t('ui.ws.calendar.delete_text'),
			confirmLabel: workspace.t('ui.ws.delete'),
			destructive: true,
			onConfirm: async () => {
				if (await form.remove()) open = false;
			},
		};
	}

	function pickContact(picked: Contact | null) {
		if (picked && !form.value.title) form.value.title = contactName(picked);
		if (picked && form.value.kind === 'spitex' && !form.value.location)
			form.value.location = `${streetLine(picked.address)}, ${picked.address.city}`;
	}

	const serviceOptions = $derived(
		form.value.kind === 'physio'
			? physioServices.map((service) => ({ value: service, label: workspace.t(`ui.ws.physio.service.${service}`) }))
			: form.value.kind === 'spitex'
				? spitexServices.map((service) => ({ value: service, label: workspace.t(`ui.ws.spitex.service.${service}`) }))
				: [],
	);
</script>

{#snippet title()}
	{form.original ? workspace.t('ui.ws.calendar.edit') : workspace.t('ui.ws.command.new_appointment')}
{/snippet}

{#snippet description()}
	{form.original ? workspace.i18n.dateTime(form.original.start) : workspace.t('ui.ws.calendar.form_text')}
{/snippet}

{#snippet fields()}
	<form id="appointment-form" class="space-y-4 px-4" onsubmit={submit} novalidate>
		<fieldset disabled={!canWrite} class="space-y-4">
			<FormField id="a-title" label={workspace.t('ui.ws.calendar.title')} error={form.fields.title}>
				<Input id="a-title" bind:value={form.value.title} aria-invalid={!!form.fields.title} />
			</FormField>
			<div class="grid grid-cols-2 gap-3">
				<FormField id="a-kind" label={workspace.t('ui.ws.calendar.kind')}>
					<Choice
						id="a-kind"
						bind:value={form.value.kind}
						options={appointmentKinds
							.filter((kind) =>
								kind === 'physio'
									? session.hasModule('physio')
									: kind === 'spitex'
										? session.hasModule('spitex')
										: true,
							)
							.map((kind) => ({ value: kind, label: workspace.t(`ui.ws.calendar.kind_${kind}`) }))}
						onchange={() => (form.value.service = null)}
					/>
				</FormField>
				<FormField id="a-status" label={workspace.t('ui.ws.status')}>
					<Choice
						id="a-status"
						bind:value={form.value.status}
						options={(['planned', 'confirmed', 'done', 'cancelled'] as const).map((status) => ({
							value: status,
							label: workspace.t(`ui.ws.appointment.status.${status}`),
						}))}
					/>
				</FormField>
			</div>
			{#if serviceOptions.length > 0}
				<FormField id="a-service" label={workspace.t('ui.ws.calendar.service')}>
					<Choice
						id="a-service"
						value={form.value.service ?? ''}
						options={serviceOptions}
						placeholder={workspace.t('ui.ws.calendar.choose_service')}
						onchange={(value) => (form.value.service = value as AppointmentFields['service'])}
					/>
				</FormField>
			{/if}
			<FormField id="a-contact" label={workspace.t('ui.ws.calendar.contact')}>
				<ContactPicker id="a-contact" bind:value={form.value.contactId} {contacts} onchange={pickContact} />
			</FormField>
			<FormField id="a-assignee" label={workspace.t('ui.ws.calendar.assignee')}>
				<Choice
					id="a-assignee"
					value={form.value.assigneeId ?? ''}
					options={[
						{ value: '', label: workspace.t('ui.ws.calendar.unassigned') },
						...people.map((person) => ({ value: person.id, label: person.name })),
					]}
					onchange={(value) => (form.value.assigneeId = (value || null) as AppointmentFields['assigneeId'])}
				/>
			</FormField>
			<div class="grid grid-cols-[1fr_6rem_6rem] gap-3">
				<FormField id="a-date" label={workspace.t('ui.ws.calendar.date')}>
					<Input id="a-date" type="date" bind:value={form.value.date} />
				</FormField>
				<FormField id="a-start" label={workspace.t('ui.from')}>
					<Input id="a-start" type="time" step="300" bind:value={form.value.startTime} />
				</FormField>
				<FormField id="a-end" label={workspace.t('ui.to')} error={form.fields.end}>
					<Input id="a-end" type="time" step="300" bind:value={form.value.endTime} aria-invalid={!!form.fields.end} />
				</FormField>
			</div>
			{#if form.value.kind === 'spitex'}
				<div class="grid grid-cols-2 gap-3">
					<FormField id="a-window-from" label={workspace.t('ui.ws.spitex.window_from')}>
						<Input id="a-window-from" type="time" step="300" bind:value={form.value.windowFrom} />
					</FormField>
					<FormField id="a-window-to" label={workspace.t('ui.ws.spitex.window_to')}>
						<Input id="a-window-to" type="time" step="300" bind:value={form.value.windowTo} />
					</FormField>
				</div>
			{/if}
			{#if conflicts.length > 0 || form.outsideWindow}
				<div
					class="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
					role="alert"
				>
					{#each conflicts as conflict (conflict.id)}
						<p class="flex items-start gap-2">
							<TriangleAlert class="mt-0.5 size-4 shrink-0" />{workspace.t('ui.ws.calendar.conflict', {
								title: conflict.title,
								from: workspace.i18n.time(conflict.start),
								to: workspace.i18n.time(conflict.end),
							})}
						</p>
					{/each}
					{#if form.outsideWindow}<p class="flex items-start gap-2">
							<TriangleAlert class="mt-0.5 size-4 shrink-0" />{workspace.t('ui.ws.spitex.outside_window')}
						</p>{/if}
				</div>
			{/if}
			<FormField id="a-location" label={workspace.t('ui.ws.calendar.location')}>
				<div class="flex items-center gap-1">
					<Input id="a-location" bind:value={form.value.location} />
					{#if form.value.location.trim()}<MapLink place={form.value.location} class="size-8" />{/if}
				</div>
			</FormField>
			<FormField id="a-notes" label={workspace.t('ui.ws.field.notes')}>
				<Textarea id="a-notes" rows={3} bind:value={form.value.notes} />
			</FormField>
		</fieldset>
		{#if form.original}
			<div class="flex flex-wrap gap-2 border-t pt-4">
				{#if contact}<Button variant="outline" size="sm" href={href(`/contacts/${contact.id}`)}>
						<UserRound class="size-4" />{contactName(contact)}
					</Button>{/if}
				{#if contact && session.hasModule('finance') && session.can('finance.write') && !form.original.billedInvoiceId}
					<Button
						variant="outline"
						size="sm"
						onclick={() => navigate(`/finance/invoices/new?appointment=${form.original?.id}`)}
					>
						<ReceiptText class="size-4" />{workspace.t('ui.ws.calendar.bill')}
					</Button>
				{/if}
				{#if form.original.billedInvoiceId}<Button
						variant="ghost"
						size="sm"
						href={href(`/finance/invoices/${form.original.billedInvoiceId}`)}
					>
						<ReceiptText class="size-4" />{workspace.t('ui.ws.calendar.billed')}
					</Button>{/if}
			</div>
		{/if}
	</form>
{/snippet}

{#snippet actions()}
	{#if form.original && canWrite}<Button variant="ghost" class="text-destructive mr-auto" onclick={askDelete}>
			<Trash2 class="size-4" />{workspace.t('ui.ws.delete')}
		</Button>{/if}
	<Button variant="outline" onclick={() => close(false)}>
		{canWrite ? workspace.t('ui.ws.cancel') : workspace.t('ui.ws.close')}
	</Button>
	{#if canWrite}<Button type="submit" form="appointment-form" disabled={form.busy}>
			{workspace.t('ui.save')}
		</Button>{/if}
{/snippet}

{#if inline}
	<dialog
		bind:this={panel}
		aria-labelledby="appointment-panel-title"
		class="bg-card text-card-foreground static m-0 hidden w-[26rem] shrink-0 flex-col gap-4 overflow-hidden rounded-xl border py-4 text-sm shadow-sm open:sticky open:top-4 open:flex"
		style:height={panelHeight ? `${panelHeight}px` : undefined}
		onkeydown={(event) => {
			if (event.key === 'Escape' && !event.defaultPrevented) {
				event.preventDefault();
				close(false);
			}
		}}
	>
		<header class="flex items-start gap-2 px-4">
			<div class="min-w-0 flex-1">
				<h2 id="appointment-panel-title" class="font-heading text-base font-medium">{@render title()}</h2>
				<p class="text-muted-foreground">{@render description()}</p>
			</div>
			<Button variant="ghost" size="icon-sm" aria-label={workspace.t('ui.ws.close')} onclick={() => close(false)}>
				<XIcon class="size-4" />
			</Button>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto">{@render fields()}</div>
		<footer class="mt-auto flex flex-row items-center gap-2 border-t px-4 pt-4">{@render actions()}</footer>
	</dialog>
{:else}
	<Sheet.Root {open} onOpenChange={close}>
		<Sheet.Content closeLabel={workspace.t('ui.ws.close')} class="w-full overflow-y-auto sm:max-w-lg">
			<Sheet.Header>
				<Sheet.Title>{@render title()}</Sheet.Title>
				<Sheet.Description>{@render description()}</Sheet.Description>
			</Sheet.Header>
			{@render fields()}
			<Sheet.Footer class="flex-row items-center">{@render actions()}</Sheet.Footer>
		</Sheet.Content>
	</Sheet.Root>
{/if}
<ConfirmDialog bind:request={confirm} />
