<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { Button } from '@clinks/ui/components/ui/button';

	/** Phones: the page's main «new» action, in reach of the thumb above the bar at the bottom. */
	let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<Button
	size="icon"
	class="fixed end-4 z-20 size-14 rounded-full shadow-lg md:hidden print:hidden"
	style="bottom: calc(4.5rem + env(safe-area-inset-bottom))"
	aria-label={label}
	{onclick}
>
	<Plus class="size-6" />
</Button>
