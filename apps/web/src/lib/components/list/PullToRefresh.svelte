<script lang="ts">
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import type { Snippet } from 'svelte';
	import { PullRefresh, pullThreshold } from '#lib/features/list/pull-refresh.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** A scrolling area that refreshes when pulled down from the top on a touch screen (see `PullRefresh`). */
	let {
		refresh,
		class: className = '',
		children,
	}: { refresh: () => Promise<unknown>; class?: string; children: Snippet } = $props();
	const workspace = useWorkspace();
	const pull = new PullRefresh(() => refresh());

	/** Touch listeners by hand, passive, so scrolling stays smooth; the area is no control of its own. */
	function gestures(element: HTMLElement) {
		const start = (event: TouchEvent) => pull.start(event.touches[0].clientY, element.scrollTop);
		const move = (event: TouchEvent) => pull.move(event.touches[0].clientY);
		const end = () => void pull.end();
		element.addEventListener('touchstart', start, { passive: true });
		element.addEventListener('touchmove', move, { passive: true });
		element.addEventListener('touchend', end);
		element.addEventListener('touchcancel', end);
		return () => {
			element.removeEventListener('touchstart', start);
			element.removeEventListener('touchmove', move);
			element.removeEventListener('touchend', end);
			element.removeEventListener('touchcancel', end);
		};
	}
</script>

<div class="relative overscroll-y-contain {className}" {@attach gestures}>
	{#if pull.offset > 0 || pull.refreshing}
		<div
			class="text-muted-foreground flex items-center justify-center gap-2 text-xs"
			style:height="{pull.refreshing ? pullThreshold / 1.5 : pull.offset}px"
			role="status"
		>
			<RefreshCw
				class="size-4 {pull.refreshing ? 'animate-spin motion-reduce:animate-none' : ''}"
				style="rotate: {pull.offset * 3}deg"
			/>
			{pull.refreshing ? workspace.t('ui.ws.list.refreshing') : workspace.t('ui.ws.list.refresh')}
		</div>
	{/if}
	{@render children()}
</div>
