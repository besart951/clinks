<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { Input } from '@clinks/ui-shared/components/ui/input';

	let {
		value = $bindable(''),
		label,
		class: className = '',
	}: { value?: string; label: string; class?: string } = $props();
</script>

<div class="relative {className}">
	<Search
		class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
		aria-hidden="true"
	/>
	<Input type="search" bind:value placeholder={label} aria-label={label} class="pl-8" />
</div>
