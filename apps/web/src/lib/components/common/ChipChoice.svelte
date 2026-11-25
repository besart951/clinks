<script lang="ts" generics="Item extends { key: string }">
	import type { Snippet } from 'svelte';

	/** A row of chips to pick one item, e.g. a board column or a role on a phone; scrolls sideways when long. */
	let {
		items,
		selected,
		label,
		onselect,
		chip,
		ref = $bindable(),
	}: {
		items: readonly Item[];
		selected: string | null;
		label: string;
		onselect: (item: Item, index: number) => void;
		chip: Snippet<[Item]>;
		ref?: HTMLElement;
	} = $props();
</script>

<div bind:this={ref} class="flex gap-1 overflow-x-auto" role="group" aria-label={label}>
	{#each items as item, index (item.key)}
		<button
			type="button"
			class="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors {selected ===
			item.key
				? 'border-foreground bg-foreground text-background'
				: 'text-muted-foreground hover:text-foreground'}"
			aria-pressed={selected === item.key}
			onclick={() => onselect(item, index)}
		>
			{@render chip(item)}
		</button>
	{/each}
</div>
