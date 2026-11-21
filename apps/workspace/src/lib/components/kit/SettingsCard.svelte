<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		card,
		actions,
		children,
	}: { card: { title: string; description?: string }; actions?: Snippet; children: Snippet } = $props();
</script>

<section class="bg-card text-card-foreground rounded-xl border p-4 shadow-[var(--shadow-sm)]">
	<header class="mb-3 flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<h2 class="text-[15px] font-semibold">{card.title}</h2>
			{#if card.description}<p class="text-muted-foreground mt-0.5 text-xs leading-relaxed">{card.description}</p>{/if}
		</div>
		{#if actions}{@render actions()}{/if}
	</header>
	{@render children()}
</section>
