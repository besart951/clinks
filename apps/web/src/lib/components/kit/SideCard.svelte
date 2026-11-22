<script lang="ts" module>
	export interface SideCardSpec {
		title: string;
		count?: string | number;
		/** Accessible label of the "+" button; the button only shows with onadd. */
		addLabel?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';

	let { card, onadd, children }: { card: SideCardSpec; onadd?: () => void; children: Snippet } = $props();
</script>

<section
	class="bg-card text-card-foreground flex min-w-0 flex-col gap-2 rounded-xl border p-4 shadow-[var(--shadow-sm)]"
>
	<header class="mb-1 flex items-center gap-2">
		<h2 class="text-sm font-semibold">{card.title}</h2>
		{#if card.count !== undefined}<span class="text-muted-foreground text-sm tabular-nums">{card.count}</span>{/if}
		{#if onadd}
			<button
				type="button"
				class="text-muted-foreground hover:bg-accent hover:text-foreground ml-auto grid size-7 place-items-center rounded-md"
				aria-label={card.addLabel ?? card.title}
				onclick={onadd}
			>
				<Plus class="size-4" />
			</button>
		{/if}
	</header>
	{@render children()}
</section>
