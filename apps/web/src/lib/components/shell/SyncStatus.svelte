<script lang="ts">
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const network = workspace.network;
	const label = $derived(
		network.offline ? 'ui.ws.sync.offline' : network.pending > 0 ? 'ui.ws.sync.syncing' : 'ui.ws.sync.saved',
	);
</script>

<span
	class="text-muted-foreground grid size-7 shrink-0 place-items-center"
	role="status"
	aria-live="polite"
	title={workspace.t(label)}
>
	{#if network.offline}
		<CloudOff class="size-3.5 text-amber-600" />
	{:else if network.pending > 0}
		<RefreshCw class="size-3.5 animate-spin" />
	{:else}
		<Cloud class="size-3.5" />
	{/if}
	<span class="sr-only">{workspace.t(label)}</span>
</span>
