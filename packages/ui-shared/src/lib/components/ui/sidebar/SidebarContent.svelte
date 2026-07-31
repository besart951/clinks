<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, class: className = '' }: { children: Snippet; class?: string } = $props();
</script>

<div class="flex flex-1 flex-col gap-2 overflow-y-auto p-3 {className}">
	{@render children()}
</div>
