<script lang="ts">
	import { getSidebarContext } from './context.svelte.js';
	import type { Snippet } from 'svelte';
	import { cn } from '../../../utils.js';

	let {
		children,
		onclick,
		active = false,
		tooltip,
		class: className = '',
	}: {
		children: Snippet;
		onclick?: () => void;
		active?: boolean;
		tooltip?: string;
		class?: string;
	} = $props();

	const ctx = getSidebarContext();
	const collapsed = $derived(!ctx.open && !ctx.mobile);
</script>

<button
	type="button"
	class={cn(
		'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
		active && 'bg-sidebar-accent text-sidebar-accent-foreground',
		collapsed && 'justify-center px-0',
		className,
	)}
	{onclick}
	title={collapsed && tooltip ? tooltip : undefined}
	aria-label={collapsed ? tooltip : undefined}
>
	<span class={cn('flex items-center gap-2', collapsed ? '' : 'flex-1')}>
		{@render children()}
	</span>
</button>
