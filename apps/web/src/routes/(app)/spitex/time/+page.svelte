<script lang="ts">
	import { onMount } from 'svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Table from '@clinks/ui/components/ui/table';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import SpitexNav from '#lib/components/spitex/SpitexNav.svelte';
	import { TimeTrackingModel } from '#lib/features/spitex/clients.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import { minutesToTime } from '@clinks/domain/dates';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new TimeTrackingModel(workspace);
	const people = new PeopleDirectory(workspace);
	const canWrite = $derived(workspace.session.can('spitex.write'));
	onMount(() => {
		return model.resource.connect();
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.add();
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.spitex.time_tracking')} · CLinks</title></svelte:head>

<ModuleGate module="spitex" permission="spitex.read">
	<PageHeader title={workspace.t('ui.ws.module.spitex')} />
	<SpitexNav />
	<div class="grid gap-6 lg:grid-cols-[1fr_20rem]">
		<AsyncView resource={model.resource}>
			{#snippet children({ entries })}
				<div class="rounded-xl border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{workspace.t('ui.ws.calendar.date')}</Table.Head><Table.Head>
									{workspace.t('ui.ws.calendar.people')}
								</Table.Head><Table.Head class="text-right">{workspace.t('ui.ws.spitex.worked')}</Table.Head><Table.Head
									class="hidden text-right sm:table-cell"
								>
									{workspace.t('ui.ws.spitex.planned')}
								</Table.Head><Table.Head class="hidden md:table-cell">
									{workspace.t('ui.ws.planner.description')}
								</Table.Head><Table.Head class="w-10">
									<span class="sr-only">{workspace.t('ui.action')}</span>
								</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each entries as entry (entry.id)}
								{@const planned = model.plannedMinutes(entry.userId, entry.date)}
								<Table.Row>
									<Table.Cell>{workspace.i18n.date(entry.date)}</Table.Cell>
									<Table.Cell>{people.get(entry.userId)?.name ?? '—'}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{minutesToTime(entry.minutes)}</Table.Cell>
									<Table.Cell class="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
										{planned ? minutesToTime(Math.round(planned)) : '–'}
									</Table.Cell>
									<Table.Cell class="text-muted-foreground hidden md:table-cell">{entry.description}</Table.Cell>
									<Table.Cell>
										{#if canWrite && entry.userId === workspace.session.user?.id}<Button
												variant="ghost"
												size="icon-xs"
												onclick={() => model.remove(entry)}
												aria-label={workspace.t('ui.ws.delete')}
											>
												<Trash2 class="size-3.5" />
											</Button>{/if}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/snippet}
		</AsyncView>
		{#if canWrite}
			<Card.Root class="h-fit">
				<Card.Header><Card.Title>{workspace.t('ui.ws.spitex.record_time')}</Card.Title></Card.Header>
				<Card.Content>
					<form class="space-y-3" onsubmit={submit}>
						<FormField id="te-date" label={workspace.t('ui.ws.calendar.date')}>
							<Input id="te-date" type="date" bind:value={model.date} />
						</FormField>
						<FormField id="te-minutes" label={workspace.t('ui.ws.spitex.minutes')}>
							<Input id="te-minutes" type="number" min="0" step="15" bind:value={model.minutes} />
						</FormField>
						<FormField id="te-description" label={workspace.t('ui.ws.planner.description')}>
							<Input id="te-description" bind:value={model.description} />
						</FormField>
						<Button type="submit" class="w-full">{workspace.t('ui.save')}</Button>
					</form>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</ModuleGate>
