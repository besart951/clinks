<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import MailX from '@lucide/svelte/icons/mail-x';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Textarea } from '@clinks/ui/components/ui/textarea';
	import FormField from '#lib/components/common/FormField.svelte';
	import PublicCard from '#lib/components/common/PublicCard.svelte';
	import SkeletonRows from '#lib/components/common/SkeletonRows.svelte';
	import { UnsubscribeModel } from '#lib/features/newsletter/public.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	// Opening the link changes nothing (link scanners open them too); the button unsubscribes.
	const workspace = useWorkspace();
	const model = new UnsubscribeModel(workspace, page.params.token ?? '');
	onMount(() => void model.load());

	function sendReason(event: SubmitEvent) {
		event.preventDefault();
		void model.sendReason();
	}
</script>

<PublicCard
	icon={MailX}
	title={model.view?.done
		? workspace.t('ui.ws.unsubscribe.done_title')
		: workspace.t('ui.ws.unsubscribe.title', { tenant: model.view?.tenantName ?? '' })}
>
	{#if model.fatal}
		<Alert.Root variant="destructive"><Alert.Description>{model.fatal}</Alert.Description></Alert.Root>
	{:else if !model.view}
		<SkeletonRows rows={2} />
	{:else if !model.view.done}
		<p class="text-muted-foreground text-sm">
			{workspace.t('ui.ws.unsubscribe.text', { tenant: model.view.tenantName })}
		</p>
		<Button class="w-full" disabled={model.busy} onclick={() => model.unsubscribe()}>
			{workspace.t('ui.ws.unsubscribe.button')}
		</Button>
	{:else if model.thanked}
		<p class="text-sm" role="status">{workspace.t('ui.ws.unsubscribe.thanks')}</p>
	{:else}
		<p class="text-sm" role="status">{workspace.t('ui.ws.unsubscribe.done', { tenant: model.view.tenantName })}</p>
		<form class="space-y-3" onsubmit={sendReason}>
			<FormField id="unsub-reason" label={workspace.t('ui.ws.unsubscribe.reason')}>
				<Textarea id="unsub-reason" rows={3} maxlength={500} bind:value={model.reason} />
			</FormField>
			<Button type="submit" variant="outline" disabled={model.busy || !model.reason.trim()}>
				{workspace.t('ui.ws.unsubscribe.send_reason')}
			</Button>
		</form>
	{/if}
</PublicCard>
