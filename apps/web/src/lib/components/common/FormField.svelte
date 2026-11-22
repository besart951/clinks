<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Label } from '@clinks/ui/components/ui/label';

	let {
		id,
		label,
		error,
		hint,
		children,
		class: className = '',
	}: { id: string; label: string; error?: string; hint?: string; children: Snippet; class?: string } = $props();
</script>

<div class="space-y-1.5 {className}">
	<Label for={id}>{label}</Label>
	{@render children()}
	{#if error}
		<p id="{id}-error" class="text-destructive text-xs" aria-live="polite">{error}</p>
	{:else if hint}
		<p id="{id}-hint" class="text-muted-foreground text-xs">{hint}</p>
	{/if}
</div>
