<script lang="ts">
	import { Skeleton } from '@clinks/ui-shared/components/ui/skeleton';
	import { useWorkspace } from '$lib/workspace.svelte';

	let { rows = 6, variant = 'list' }: { rows?: number; variant?: 'list' | 'cards' | 'detail' } = $props();
	const workspace = useWorkspace();
</script>

<div aria-busy="true" aria-live="polite" class="space-y-3">
	<span class="sr-only">{workspace.t('ui.loading')}</span>
	{#if variant === 'cards'}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			{#each { length: rows } as _, index (index)}<Skeleton class="h-28 rounded-xl" />{/each}
		</div>
	{:else if variant === 'detail'}
		<Skeleton class="h-8 w-1/3" />
		<Skeleton class="h-4 w-1/2" />
		<Skeleton class="h-64 rounded-xl" />
	{:else}
		{#each { length: rows } as _, index (index)}
			<div class="flex items-center gap-3">
				<Skeleton class="size-9 rounded-full" />
				<div class="flex-1 space-y-2"><Skeleton class="h-4 w-2/5" /><Skeleton class="h-3 w-1/4" /></div>
				<Skeleton class="h-6 w-20" />
			</div>
		{/each}
	{/if}
</div>
