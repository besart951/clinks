<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	let { label, children }: { label: string; children: Snippet } = $props();
	let open = $state(false);
</script>

<button
	type="button"
	class="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-8 items-center gap-1.5 justify-self-start rounded-md px-2 text-[13px]"
	aria-expanded={open}
	onclick={() => (open = !open)}
>
	<ChevronDown class="size-3.5 transition-transform duration-200 {open ? 'rotate-180' : ''}" />{label}
</button>
{#if open}<div class="grid">{@render children()}</div>{/if}
