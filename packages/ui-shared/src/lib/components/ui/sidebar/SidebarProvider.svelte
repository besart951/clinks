<script lang="ts">
	import { SidebarState, setSidebarContext } from './context.svelte.js';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const sidebar = new SidebarState();
	setSidebarContext(sidebar);

	$effect(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		sidebar.mobile = mq.matches;
		if (mq.matches) sidebar.open = false;
		const handler = (e: MediaQueryListEvent) => {
			sidebar.mobile = e.matches;
			if (e.matches) sidebar.open = false;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});
</script>

{@render children()}
