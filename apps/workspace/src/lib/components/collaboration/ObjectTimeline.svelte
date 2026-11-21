<script lang="ts">
	import { onMount } from 'svelte';
	import ActivityFeed from '$lib/components/common/ActivityFeed.svelte';
	import type { PeopleDirectory } from '$lib/features/collaboration/people.svelte';
	import { Resource } from '$lib/state/resource.svelte';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { targetId, people }: { targetId: string; people: PeopleDirectory } = $props();
	const workspace = useWorkspace();
	const resource = new Resource(workspace.db, ['audit'], async () =>
		(await workspace.api.audit.list((row) => row.target.id === targetId)).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
	);
	onMount(() => resource.connect());
</script>

{#if (resource.data ?? []).length === 0}
	<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.activity.empty')}</p>
{:else}
	<ActivityFeed entries={resource.data ?? []} actors={people.byId} />
{/if}
