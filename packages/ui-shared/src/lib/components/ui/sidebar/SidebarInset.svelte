<script lang="ts">
	import { getSidebarContext } from './context.svelte.js';
	import type { Snippet } from 'svelte';

	let { children, class: className = '' }: { children: Snippet; class?: string } = $props();
	const ctx = getSidebarContext();
</script>

<main
	class="flex-1 transition-all duration-200 {className}"
	class:ml-64={ctx.open && !ctx.mobile}
	class:ml-14={!ctx.open && !ctx.mobile}
>
	{@render children()}
</main>
