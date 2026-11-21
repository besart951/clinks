<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import UserRound from '@lucide/svelte/icons/user-round';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import * as Tabs from '@clinks/ui-shared/components/ui/tabs';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Textarea } from '@clinks/ui-shared/components/ui/textarea';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import AsyncView from '$lib/components/common/AsyncView.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import StatusBadge from '$lib/components/common/StatusBadge.svelte';
	import { appointmentTone } from '$lib/components/common/tones';
	import AttachmentPanel from '$lib/components/collaboration/AttachmentPanel.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import { ClientFileModel } from '$lib/features/spitex/clients.svelte';
	import { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import { contactName } from '$lib/data/workspace-api';
	import type { ContactId } from '$lib/domain/ids';
	import { href } from '$lib/navigation';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ClientFileModel(workspace, page.params.id as ContactId);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('spitex.write'));
	onMount(() => {
		void people.load();
		return model.resource.connect();
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.addNote();
	}
</script>

<svelte:head><title>{model.resource.data ? contactName(model.resource.data.client) : workspace.t('ui.ws.spitex.clients')} · CLinks</title></svelte:head>

<ModuleGate module="spitex" permission="spitex.read">
	<AsyncView resource={model.resource} skeleton="detail">
		{#snippet children({ client, visits, notes })}
			<PageHeader title={contactName(client)} description="{client.address.street}, {client.address.zip} {client.address.city} · {client.phone}" crumbs={[{ label: workspace.t('ui.ws.spitex.clients'), path: '/spitex/clients' }, { label: contactName(client) }]}>
				{#snippet actions()}<Button variant="outline" href={href(`/contacts/${client.id}`)}><UserRound class="size-4" />{workspace.t('ui.ws.physio.contact_card')}</Button>{/snippet}
			</PageHeader>
			{#if client.notes}<p class="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"><KeyRound class="size-4" />{client.notes}</p>{/if}
			<Tabs.Root value="care">
				<Tabs.List class="mb-4">
					<Tabs.Trigger value="care">{workspace.t('ui.ws.spitex.care_notes')} ({notes.length})</Tabs.Trigger>
					<Tabs.Trigger value="visits">{workspace.t('ui.ws.spitex.visits')} ({visits.length})</Tabs.Trigger>
					<Tabs.Trigger value="documents">{workspace.t('ui.ws.module.documents')}</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="care">
					<div class="grid gap-6 lg:grid-cols-[1fr_24rem]">
						<ol class="space-y-3">
							{#each notes as note (note.id)}
								<li class="rounded-xl border p-4 text-sm">
									<p class="mb-2 text-xs"><span class="font-medium">{workspace.i18n.date(note.date)}</span> <span class="text-muted-foreground">{people.get(note.authorId)?.name ?? ''}</span></p>
									<dl class="grid gap-1 sm:grid-cols-[8rem_1fr]">
										<dt class="text-muted-foreground">{workspace.t('ui.ws.spitex.wellbeing')}</dt><dd>{note.subjective || '—'}</dd>
										<dt class="text-muted-foreground">{workspace.t('ui.ws.spitex.vitals')}</dt><dd>{note.objective || '—'}</dd>
										<dt class="text-muted-foreground">{workspace.t('ui.ws.spitex.evaluation')}</dt><dd>{note.assessment || '—'}</dd>
										<dt class="text-muted-foreground">{workspace.t('ui.ws.spitex.measures')}</dt><dd>{note.plan || '—'}</dd>
									</dl>
								</li>
							{:else}<li class="text-muted-foreground text-sm">{workspace.t('ui.ws.spitex.no_notes')}</li>{/each}
						</ol>
						{#if canWrite}
							<Card.Root class="h-fit">
								<Card.Header><Card.Title>{workspace.t('ui.ws.spitex.new_note')}</Card.Title></Card.Header>
								<Card.Content>
									<form class="space-y-3" onsubmit={submit}>
										<FormField id="sn-s" label={workspace.t('ui.ws.spitex.wellbeing')}><Textarea id="sn-s" rows={2} bind:value={model.draft.subjective} /></FormField>
										<FormField id="sn-o" label={workspace.t('ui.ws.spitex.vitals')}><Textarea id="sn-o" rows={2} bind:value={model.draft.objective} /></FormField>
										<FormField id="sn-a" label={workspace.t('ui.ws.spitex.evaluation')}><Textarea id="sn-a" rows={2} bind:value={model.draft.assessment} /></FormField>
										<FormField id="sn-p" label={workspace.t('ui.ws.spitex.measures')}><Textarea id="sn-p" rows={2} bind:value={model.draft.plan} /></FormField>
										<Button type="submit" class="w-full" disabled={model.busy}>{workspace.t('ui.save')}</Button>
									</form>
								</Card.Content>
							</Card.Root>
						{/if}
					</div>
				</Tabs.Content>
				<Tabs.Content value="visits">
					<ul class="divide-y rounded-xl border">
						{#each visits as visit (visit.id)}
							<li class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
								<a class="w-40 tabular-nums hover:underline" href={href(`/spitex?date=${visit.start.slice(0, 10)}`)}>{workspace.i18n.dateTime(visit.start)}</a>
								<span class="flex-1">{visit.service ? workspace.t(`ui.ws.spitex.service.${visit.service}`) : visit.title}</span>
								<span class="text-muted-foreground">{people.get(visit.assigneeId)?.name ?? workspace.t('ui.ws.calendar.open')}</span>
								<StatusBadge tone={appointmentTone[visit.status]} label={workspace.t(`ui.ws.appointment.status.${visit.status}`)} />
							</li>
						{/each}
					</ul>
				</Tabs.Content>
				<Tabs.Content value="documents"><AttachmentPanel target={{ kind: 'contact', id: client.id }} /></Tabs.Content>
			</Tabs.Root>
		{/snippet}
	</AsyncView>
</ModuleGate>
