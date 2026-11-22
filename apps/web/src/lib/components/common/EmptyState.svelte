<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import Inbox from '@lucide/svelte/icons/inbox';

	let {
		title,
		description,
		icon: Icon = Inbox,
		action,
	}: { title: string; description?: string; icon?: Component<{ class?: string }>; action?: Snippet } = $props();
</script>

<div class="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
	<span class="bg-muted text-muted-foreground grid size-11 place-items-center rounded-full">
		<Icon class="size-5" />
	</span>
	<div class="space-y-1">
		<p class="font-medium">{title}</p>
		{#if description}<p class="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>{/if}
	</div>
	{#if action}{@render action()}{/if}
</div>
