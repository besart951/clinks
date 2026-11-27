<script lang="ts">
	import { onMount } from 'svelte';
	import { Label } from '@clinks/ui/components/ui/label';
	import { Switch } from '@clinks/ui/components/ui/switch';
	import { readAlertChoice, writeAlertChoice, type MailAlertChoice } from '#lib/features/mail/mail-alerts.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/**
	 * «Push» per mailbox: which of the person's addresses announce new mail on this device. Saved on the device
	 * right away, like the other device settings.
	 */
	const workspace = useWorkspace();
	let addresses = $state<string[]>([]);
	let choice = $state<MailAlertChoice>(readAlertChoice(workspace));

	onMount(async () => {
		const senders = await workspace.mailOutgoing.senders().catch(() => []);
		addresses = [...new Set(senders.map((sender) => sender.address.toLowerCase()))];
	});

	function set(address: string, on: boolean) {
		choice = { ...choice, [address]: on };
		writeAlertChoice(workspace, $state.snapshot(choice));
	}
</script>

<fieldset class="space-y-3 sm:col-span-2">
	<legend class="mb-1 text-sm font-medium">{workspace.t('ui.ws.settings.mail_alerts')}</legend>
	<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.settings.mail_alerts_text')}</p>
	{#each [...addresses, 'other'] as address (address)}
		<div class="flex items-center justify-between gap-4">
			<Label for="alert-{address}" class="min-w-0 truncate font-normal">
				{address === 'other' ? workspace.t('ui.ws.settings.mail_alerts_other') : address}
			</Label>
			<Switch id="alert-{address}" checked={choice[address] ?? true} onCheckedChange={(on) => set(address, on)} />
		</div>
	{/each}
</fieldset>
