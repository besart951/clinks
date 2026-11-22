<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { href } from '$lib/navigation';

	interface Crumb {
		label: string;
		path?: string;
	}

	let {
		title,
		description,
		crumbs = [],
		actions,
	}: { title: string; description?: string; crumbs?: Crumb[]; actions?: Snippet } = $props();
</script>

<header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
	<div class="min-w-0 space-y-1">
		{#if crumbs.length > 0}
			<nav aria-label="Breadcrumb" class="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
				{#each crumbs as crumb, index (index)}
					{#if crumb.path}
						<a class="hover:text-foreground" href={href(crumb.path)}>{crumb.label}</a>
					{:else}
						<span aria-current="page">{crumb.label}</span>
					{/if}
					{#if index < crumbs.length - 1}<ChevronRight class="size-3" aria-hidden="true" />{/if}
				{/each}
			</nav>
		{/if}
		<h1 class="truncate text-2xl font-semibold tracking-tight">{title}</h1>
		{#if description}<p class="text-muted-foreground text-sm">{description}</p>{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
	{/if}
</header>
