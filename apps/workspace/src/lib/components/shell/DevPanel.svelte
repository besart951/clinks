<script lang="ts">
	import Wrench from '@lucide/svelte/icons/wrench';
	import * as Popover from '@clinks/ui-shared/components/ui/popover';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Switch } from '@clinks/ui-shared/components/ui/switch';
	import { Label } from '@clinks/ui-shared/components/ui/label';
	import ConfirmDialog, { type ConfirmRequest } from '$lib/components/common/ConfirmDialog.svelte';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const network = workspace.network;
	let request = $state<ConfirmRequest | null>(null);
	const failureOptions = [0, 0.1, 0.3, 1];
	const latencyOptions = [
		{ label: 'ui.ws.dev.latency_none', min: 0, max: 0 },
		{ label: 'ui.ws.dev.latency_normal', min: 200, max: 800 },
		{ label: 'ui.ws.dev.latency_slow', min: 1500, max: 3000 },
	];

	function askReset() {
		request = {
			title: workspace.t('ui.ws.dev.reset_title'),
			description: workspace.t('ui.ws.dev.reset_text'),
			confirmLabel: workspace.t('ui.ws.dev.reset'),
			destructive: true,
			onConfirm: () => {
				workspace.resetDemo();
				location.reload();
			},
		};
	}
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="icon-sm" class="fixed bottom-20 left-3 z-30 rounded-full shadow-md md:bottom-3" aria-label={workspace.t('ui.ws.dev.title')}>
				<Wrench class="size-3.5" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="start" side="top" class="w-80 space-y-4">
		<div>
			<p class="font-medium">{workspace.t('ui.ws.dev.title')}</p>
			<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.dev.text')}</p>
		</div>
		<fieldset class="space-y-2">
			<legend class="text-sm font-medium">{workspace.t('ui.ws.dev.latency')}</legend>
			<div class="flex flex-wrap gap-1">
				{#each latencyOptions as option (option.label)}
					<Button size="xs" variant={network.minLatency === option.min && network.maxLatency === option.max ? 'default' : 'outline'} onclick={() => network.update({ minLatency: option.min, maxLatency: option.max })}>{workspace.t(option.label)}</Button>
				{/each}
			</div>
		</fieldset>
		<fieldset class="space-y-2">
			<legend class="text-sm font-medium">{workspace.t('ui.ws.dev.failure_rate')}</legend>
			<div class="flex flex-wrap gap-1">
				{#each failureOptions as rate (rate)}
					<Button size="xs" variant={network.failureRate === rate ? 'default' : 'outline'} onclick={() => network.update({ failureRate: rate })}>{workspace.i18n.number(rate * 100)} %</Button>
				{/each}
			</div>
		</fieldset>
		<div class="flex items-center justify-between">
			<Label for="simulate-offline">{workspace.t('ui.ws.dev.offline')}</Label>
			<Switch id="simulate-offline" checked={network.simulateOffline} onCheckedChange={(checked) => network.update({ simulateOffline: checked })} />
		</div>
		{#if !workspace.persistent}<p class="text-xs text-amber-700">{workspace.t('ui.ws.dev.not_persistent')}</p>{/if}
		<Button variant="destructive" size="sm" class="w-full" onclick={askReset}>{workspace.t('ui.ws.dev.reset')}</Button>
	</Popover.Content>
</Popover.Root>
<ConfirmDialog bind:request />
