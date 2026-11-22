<script lang="ts">
	import { getSidebarContext } from './context.svelte.js';
	import type { Snippet } from 'svelte';

	let { children, class: className = '' }: { children: Snippet; class?: string } = $props();
	const ctx = getSidebarContext();
</script>

<aside
	class="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border transition-all duration-200 {className}"
	class:max-md:w-72={ctx.mobile}
	class:max-md:translate-x-0={ctx.mobile && ctx.open}
	class:max-md:-translate-x-full={ctx.mobile && !ctx.open}
	class:w-64={!ctx.mobile && ctx.open}
	class:w-14={!ctx.mobile && !ctx.open}
>
	{@render children()}
</aside>
