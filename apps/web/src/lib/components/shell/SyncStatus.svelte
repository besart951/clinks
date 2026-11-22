<script lang="ts">
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const network = workspace.network;
	const sync = workspace.sync;

	// With the real backend the synced database reports; on the mock the simulated network does.
	const offline = $derived(sync ? !sync.connected : network.offline);
	const busy = $derived(sync ? sync.uploading || sync.downloading : network.pending > 0);
	const pending = $derived(sync?.pendingWrites ?? 0);
	const label = $derived(offline ? 'ui.ws.sync.offline' : busy ? 'ui.ws.sync.syncing' : 'ui.ws.sync.saved');
	const details = $derived(
		[
			workspace.t(label),
			pending > 0 ? workspace.t('ui.ws.sync.pending', { count: pending }) : '',
			sync?.lastSyncedAt
				? workspace.t('ui.ws.sync.last', { time: workspace.i18n.time(sync.lastSyncedAt.toISOString()) })
				: '',
		]
			.filter(Boolean)
			.join(' · '),
	);
</script>

<span
	class="text-muted-foreground relative grid size-7 shrink-0 place-items-center"
	role="status"
	aria-label={workspace.t('ui.ws.sync.label')}
	title={details}
>
	{#if offline}
		<CloudOff class="size-3.5 text-amber-600" aria-hidden="true" />
	{:else if busy}
		<RefreshCw class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
	{:else}
		<Cloud class="size-3.5" aria-hidden="true" />
	{/if}
	{#if pending > 0}
		<span
			class="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid min-w-3.5 place-items-center rounded-full px-0.5 text-[0.625rem] leading-3.5 font-medium"
			aria-hidden="true"
		>
			{pending}
		</span>
	{/if}
	<span class="sr-only">{details}</span>
</span>
