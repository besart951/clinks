<script lang="ts">
	import PasswordInput from '#lib/components/auth/PasswordInput.svelte';
	import Download from '@lucide/svelte/icons/download';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import { PrivacyModel } from '#lib/features/settings/settings.svelte';
	import { navigate } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new PrivacyModel(workspace);
	let deleteOpen = $state(false);

	async function remove(event: SubmitEvent) {
		event.preventDefault();
		if (await model.deleteAccount()) await navigate('/login');
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.privacy')} · CLinks</title></svelte:head>

<PageHeader title={workspace.t('ui.ws.settings.privacy')} description={workspace.t('ui.ws.privacy.text')} />
<div class="space-y-6">
	<Card.Root>
		<Card.Header><Card.Title>{workspace.t('ui.ws.privacy.hosting')}</Card.Title></Card.Header>
		<Card.Content class="text-muted-foreground space-y-1 text-sm">
			<p>{workspace.t('ui.ws.privacy.hosting_text')}</p>
			<p>{workspace.t('ui.ws.privacy.health_text')}</p>
		</Card.Content>
	</Card.Root>
	{#if workspace.session.can('settings.manage')}
		<Card.Root>
			<Card.Header>
				<Card.Title>{workspace.t('ui.ws.privacy.export')}</Card.Title><Card.Description>
					{workspace.t('ui.ws.privacy.export_text')}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" disabled={model.busy} onclick={() => model.exportData()}>
					<Download class="size-4" />{workspace.t('ui.ws.privacy.export_button')}
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
	{#if !workspace.remote}
		<Card.Root class="border-destructive/40">
			<Card.Header>
				<Card.Title class="text-destructive">{workspace.t('ui.ws.privacy.delete')}</Card.Title><Card.Description>
					{workspace.t('ui.ws.privacy.delete_text')}
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button variant="destructive" onclick={() => (deleteOpen = true)}>
					{workspace.t('ui.ws.privacy.delete_button')}
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<Dialog.Root bind:open={deleteOpen}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{workspace.t('ui.ws.privacy.delete_confirm_title')}</Dialog.Title><Dialog.Description>
				{workspace.t('ui.ws.privacy.delete_confirm_text')}
			</Dialog.Description>
		</Dialog.Header>
		<form id="delete-form" onsubmit={remove}>
			<FormField id="del-password" label={workspace.t('ui.password')} error={model.fields.password}>
				<PasswordInput id="del-password" autocomplete="current-password" bind:value={model.password} />
			</FormField>
		</form>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteOpen = false)}>{workspace.t('ui.ws.cancel')}</Button><Button
				type="submit"
				form="delete-form"
				variant="destructive"
				disabled={!model.password || model.busy}
			>
				{workspace.t('ui.ws.privacy.delete_button')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
