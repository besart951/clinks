<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '@clinks/ui/components/ui/card';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import ActivityFeed from '#lib/components/common/ActivityFeed.svelte';
	import SearchInput from '#lib/components/common/SearchInput.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import { ActivityModel } from '#lib/features/activity/activity.svelte';
	import { PeopleDirectory } from '#lib/features/collaboration/people.svelte';
	import type { AuditTargetKind } from '@clinks/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new ActivityModel(workspace);
	const people = new PeopleDirectory(workspace);
	onMount(() => {
		return model.resource.connect();
	});
</script>

<svelte:head><title>{workspace.t('ui.ws.nav.activity')} · CLinks</title></svelte:head>

<ModuleGate permission="audit.read">
	<PageHeader title={workspace.t('ui.ws.nav.activity')} description={workspace.t('ui.audit_immutable')} />
	<div class="mb-4 flex flex-wrap items-end gap-2">
		<SearchInput bind:value={model.search} label={workspace.t('ui.ws.activity.search')} class="w-full sm:w-64" />
		<Choice
			bind:value={model.actor}
			class="w-48"
			label={workspace.t('ui.ws.activity.who')}
			options={[
				{ value: '', label: workspace.t('ui.ws.activity.everyone') },
				...people.people.map((person) => ({ value: person.id, label: person.name })),
			]}
		/>
		<Choice
			value={model.kind}
			class="w-44"
			label={workspace.t('ui.ws.activity.what')}
			options={[
				{ value: '', label: workspace.t('ui.ws.activity.everything') },
				...model.kinds.map((kind) => ({ value: kind, label: workspace.t(`ui.ws.activity.kind_${kind}`) })),
			]}
			onchange={(value) => (model.kind = value as AuditTargetKind | '')}
		/>
		<label class="text-muted-foreground flex items-center gap-1 text-sm">
			{workspace.t('ui.from')}<Input type="date" class="w-36" bind:value={model.from} />
		</label>
		<label class="text-muted-foreground flex items-center gap-1 text-sm">
			{workspace.t('ui.to')}<Input type="date" class="w-36" bind:value={model.to} />
		</label>
	</div>
	<AsyncView resource={model.resource}>
		<Card.Root>
			<Card.Content>
				{#if model.visible.length === 0}<p class="text-muted-foreground py-6 text-center text-sm">
						{workspace.t('ui.ws.activity.empty')}
					</p>{:else}<ActivityFeed entries={model.visible} actors={people.byId} />{/if}
				{#if model.filtered.length > model.visible.length}<Button
						variant="outline"
						class="mt-4 w-full"
						onclick={() => (model.limit += 50)}
					>
						{workspace.t('ui.load_more')}
					</Button>{/if}
			</Card.Content>
		</Card.Root>
	</AsyncView>
</ModuleGate>
