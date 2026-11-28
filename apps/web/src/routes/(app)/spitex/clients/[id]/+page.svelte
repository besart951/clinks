<script lang="ts">
	import VisitNeeds from '#lib/components/spitex/VisitNeeds.svelte';
	import MapLink from '#lib/components/common/MapLink.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Phone from '@lucide/svelte/icons/phone';
	import Plus from '@lucide/svelte/icons/plus';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import AttachmentPanel from '#lib/components/collaboration/AttachmentPanel.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import DetailHeader from '#lib/components/kit/DetailHeader.svelte';
	import Accordion from '@clinks/ui/kit/Accordion.svelte';
	import AccordionSection from '#lib/components/kit/AccordionSection.svelte';
	import AttributeList from '#lib/components/kit/AttributeList.svelte';
	import InlineText from '#lib/components/kit/InlineText.svelte';
	import SideCard from '@clinks/ui/kit/SideCard.svelte';
	import PastToggle from '@clinks/ui/kit/PastToggle.svelte';
	import SoapNote, { soapFields } from '#lib/components/kit/SoapNote.svelte';
	import Initials from '@clinks/ui/kit/Initials.svelte';
	import { personBadge } from '@clinks/ui/kit/avatar';
	import { ClientFileModel } from '#lib/features/spitex/clients.svelte';
	import { insuranceFields, patientMasterFields } from '#lib/features/physio/patient-fields';
	import { formatAddress } from '@clinks/domain/address';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { contactName } from '#lib/data/workspace-api';
	import { ageOn, today } from '@clinks/domain/dates';
	import type { Appointment } from '@clinks/domain/types';
	import type { ContactId } from '@clinks/domain/ids';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ClientFileModel(workspace, page.params.id as ContactId);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('spitex.write'));
	const text = { t: workspace.t.bind(workspace), date: (value: string) => workspace.i18n.date(value) };
	const labels = {
		subjective: workspace.t('ui.ws.spitex.wellbeing'),
		objective: workspace.t('ui.ws.spitex.vitals'),
		assessment: workspace.t('ui.ws.spitex.evaluation'),
		plan: workspace.t('ui.ws.spitex.measures'),
	};
	const letters = { subjective: 'B', objective: 'V', assessment: 'E', plan: 'M' };
	let composing = $state(false);

	onMount(() => {
		return model.resource.connect();
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (await model.addNote()) composing = false;
	}
</script>

<svelte:head>
	<title
		>{model.resource.data ? contactName(model.resource.data.client) : workspace.t('ui.ws.spitex.clients')} · CLinks</title
	>
</svelte:head>

{#snippet visitRow(visit: Appointment)}
	{@const assignee = people.get(visit.assigneeId)}
	<a
		class="hover:bg-accent grid h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 text-[13px]"
		href={href(`/spitex?date=${visit.start.slice(0, 10)}`)}
	>
		<span class="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
			<b class="font-medium">
				{workspace.i18n.format(new Date(visit.start), { weekday: 'short', day: 'numeric', month: 'short' })}
			</b>
			<span class="text-muted-foreground truncate">
				{workspace.i18n.time(visit.start)} · {visit.title}
				{visit.service ? workspace.t(`ui.ws.spitex.service.${visit.service}`) : ''}
			</span>
		</span>
		{#if assignee}<span title={assignee.name}><Initials name={assignee.name} size="sm" /></span>{:else}<span
				class="rounded-full border border-dashed border-[var(--warning)] px-2 text-[11px] text-[var(--warning)]"
			>
				{workspace.t('ui.ws.calendar.open')}
			</span>{/if}
	</a>
{/snippet}

<ModuleGate module="spitex" permission="spitex.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ client, visits, notes, needs })}
			{@const now = new Date().toISOString()}
			{@const upcoming = visits.filter((visit) => visit.start >= now).reverse()}
			{@const past = visits.filter((visit) => visit.start < now)}
			<DetailHeader
				header={{
					title: contactName(client),
					back: { label: workspace.t('ui.ws.spitex.clients'), path: '/spitex/clients' },
					avatar: personBadge(contactName(client)),
					meta: [
						client.birthDate ? workspace.t('ui.ws.inline.age', { years: ageOn(client.birthDate, today()) }) : '',
						formatAddress(client.address),
					].filter(Boolean),
					badges: [client.insurer].filter(Boolean),
				}}
			>
				{#snippet actions()}
					{#if client.phone}<Button variant="ghost" size="icon-sm" href="tel:{client.phone}" aria-label={client.phone}>
							<Phone class="size-4" />
						</Button>{/if}
					{#if formatAddress(client.address)}<MapLink place={formatAddress(client.address)} class="size-8" />{/if}
					<Button variant="outline" size="sm" href={href(`/contacts/${client.id}`)}>
						<UserRound class="size-4" />{workspace.t('ui.ws.physio.contact_card')}
					</Button>
				{/snippet}
			</DetailHeader>

			<div
				class="mb-6 flex items-start gap-2 rounded-lg border px-3 py-1.5 {client.notes
					? 'border-[var(--warning)]/40 bg-[var(--warning)]/10'
					: 'border-dashed'}"
			>
				<KeyRound class="mt-2 size-4 shrink-0 {client.notes ? 'text-[var(--warning)]' : 'text-muted-foreground'}" />
				<div class="min-w-0 flex-1">
					<InlineText
						text={{
							value: client.notes,
							placeholder: workspace.t('ui.ws.spitex.access_placeholder'),
							label: workspace.t('ui.ws.spitex.access_note'),
						}}
						readonly={!canWrite}
						onsave={(value) => model.saveField(client, 'notes', value, workspace.t('ui.ws.spitex.access_note'))}
					/>
				</div>
			</div>

			<VisitNeeds contactId={client.id} {needs} />

			<div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<Accordion>
					<AccordionSection
						section={{ id: 'client.notes', title: workspace.t('ui.ws.spitex.care_notes'), count: notes.length }}
					>
						{#snippet tools()}
							{#if canWrite && !composing}<Button variant="ghost" size="sm" onclick={() => (composing = true)}>
									<Plus class="size-4" />{workspace.t('ui.ws.spitex.new_note')}
								</Button>{/if}
						{/snippet}
						{#if composing}
							<form class="bg-sunken mb-2 grid gap-2 rounded-lg border p-3" onsubmit={submit}>
								{#each soapFields as field (field)}
									<label class="grid gap-1">
										<span class="text-muted-foreground text-xs font-medium">{labels[field]}</span>
										<Textarea
											rows={2}
											class="bg-field min-h-0"
											bind:value={model.draft[field]}
											{@attach (node) => {
												if (field === 'subjective') node.focus();
											}}
										/>
									</label>
								{/each}
								<div class="flex justify-end gap-2">
									<Button variant="ghost" size="sm" type="button" onclick={() => (composing = false)}>
										{workspace.t('ui.ws.cancel')}
									</Button>
									<Button size="sm" type="submit" disabled={model.busy}>{workspace.t('ui.save')}</Button>
								</div>
							</form>
						{/if}
						<div class="grid">
							{#each notes as note, index (note.id)}
								<SoapNote
									{note}
									meta={{ author: people.get(note.authorId)?.name ?? '', labels, open: index === 0, letters }}
								/>
							{:else}
								{#if !composing}<p class="text-muted-foreground px-1 text-sm">
										{workspace.t('ui.ws.spitex.no_notes')}
									</p>{/if}
							{/each}
						</div>
					</AccordionSection>
					<AccordionSection section={{ id: 'client.master', title: workspace.t('ui.ws.contacts.master_data') }}>
						<AttributeList
							list={{ fields: patientMasterFields(client, text), readonly: !canWrite }}
							onsave={(field, value) => model.saveField(client, field.key, value, field.label)}
						/>
					</AccordionSection>
					<AccordionSection
						section={{
							id: 'client.insurance',
							title: workspace.t('ui.ws.physio.insurance'),
							count: client.insurer,
							defaultOpen: false,
						}}
					>
						<AttributeList
							list={{ fields: insuranceFields(client, text), readonly: !canWrite }}
							onsave={(field, value) => model.saveField(client, field.key, value, field.label)}
						/>
					</AccordionSection>
					<AccordionSection section={{ id: 'client.documents', title: workspace.t('ui.ws.module.documents') }}>
						<AttachmentPanel target={{ kind: 'contact', id: client.id }} />
					</AccordionSection>
				</Accordion>

				<aside class="grid gap-4">
					<SideCard card={{ title: workspace.t('ui.ws.spitex.visits'), count: upcoming.length }}>
						<div class="grid">
							{#each upcoming.slice(0, 8) as visit (visit.id)}{@render visitRow(visit)}{:else}
								<p class="text-muted-foreground px-1 text-[13px]">{workspace.t('ui.ws.contacts.no_appointments')}</p>
							{/each}
						</div>
						{#if past.length > 0}
							<PastToggle label={workspace.t('ui.ws.inline.past', { count: past.length })}>
								{#each past.slice(0, 20) as visit (visit.id)}{@render visitRow(visit)}{/each}
							</PastToggle>
						{/if}
					</SideCard>
				</aside>
			</div>
		{/snippet}
	</AsyncView>
</ModuleGate>
