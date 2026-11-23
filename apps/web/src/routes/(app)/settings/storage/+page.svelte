<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ShieldAlert from '@lucide/svelte/icons/shield-alert';
	import Info from '@lucide/svelte/icons/info';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Alert from '@clinks/ui/components/ui/alert';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Checkbox } from '@clinks/ui/components/ui/checkbox';
	import { Skeleton } from '@clinks/ui/components/ui/skeleton';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import StorageProviderPicker from '#lib/components/settings/StorageProviderPicker.svelte';
	import StorageConnectionFields from '#lib/components/settings/StorageConnectionFields.svelte';
	import { StorageSettingsModel } from '#lib/features/settings/storage.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new StorageSettingsModel(workspace);
	onMount(() => void model.load());

	async function save(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		if (await model.save()) return;
		// Move focus to the first field the server rejected, so its error is read out.
		await tick();
		form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.storage')} · CLinks</title></svelte:head>

<ModuleGate permission="settings.manage">
	<PageHeader title={workspace.t('ui.ws.settings.storage')} description={workspace.t('ui.ws.storage.text')} />
	{#if !model.loaded}
		<Skeleton class="h-64 w-full" />
	{:else if model.loadError}
		<Alert.Root variant="destructive">
			<ShieldAlert class="size-4" />
			<Alert.Title>{workspace.t('ui.ws.storage.unavailable')}</Alert.Title>
			<Alert.Description>{model.loadError}</Alert.Description>
			<Button variant="outline" size="sm" class="mt-2 w-fit" onclick={() => model.load()}>
				{workspace.t('ui.try_again')}
			</Button>
		</Alert.Root>
	{:else}
		<form class="space-y-4" aria-labelledby="storage-title" onsubmit={save} novalidate>
			<Card.Root>
				<Card.Header>
					<Card.Title id="storage-title">{workspace.t('ui.ws.storage.location')}</Card.Title>
					<Card.Description>{workspace.t('ui.ws.storage.location_text')}</Card.Description>
				</Card.Header>
				<Card.Content><StorageProviderPicker {model} /></Card.Content>
			</Card.Root>

			{#if model.provider !== 'clinks'}
				<Card.Root>
					<Card.Header>
						<Card.Title>{workspace.t('ui.ws.storage.connection')}</Card.Title>
						<Card.Description>{workspace.t(`ui.ws.storage.connection_${model.provider}`)}</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-4">
						<StorageConnectionFields {model} />
						{#if model.consentNeeded}
							<Alert.Root variant="destructive">
								<ShieldAlert class="size-4" />
								<Alert.Title>{workspace.t('ui.ws.storage.health_title')}</Alert.Title>
								<Alert.Description>{workspace.t('ui.ws.storage.health_text')}</Alert.Description>
							</Alert.Root>
							<div class="space-y-1">
								<label class="flex items-start gap-2 text-sm">
									<Checkbox
										bind:checked={model.acknowledgeLocation}
										aria-invalid={!!model.fields.acknowledgeLocation}
										aria-describedby={model.fields.acknowledgeLocation ? 'storage-consent-error' : undefined}
									/>
									<span>{workspace.t('ui.ws.storage.health_consent')}</span>
								</label>
								{#if model.fields.acknowledgeLocation}
									<p id="storage-consent-error" class="text-destructive text-xs">{model.fields.acknowledgeLocation}</p>
								{/if}
							</div>
						{:else if model.location !== 'switzerland'}
							<Alert.Root>
								<Info class="size-4" />
								<Alert.Description>{workspace.t('ui.ws.storage.outside_ch')}</Alert.Description>
							</Alert.Root>
						{/if}
					</Card.Content>
				</Card.Root>
			{:else}
				<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.storage.clinks_details')}</p>
			{/if}

			<div class="flex flex-wrap items-center justify-end gap-3">
				{#if model.stored?.lastCheck && model.stored.provider === model.provider}
					<p class="text-muted-foreground me-auto text-sm" role="status">
						{workspace.t(
							model.stored.lastCheck.ok ? 'ui.ws.storage.last_check_ok' : 'ui.ws.storage.last_check_failed',
							{
								time: new Date(model.stored.lastCheck.at).toLocaleString(workspace.i18n.locale),
							},
						)}
					</p>
				{/if}
				{#if model.stored && model.stored.provider === model.provider}
					<Button type="button" variant="outline" disabled={model.testing} onclick={() => model.test()}>
						{workspace.t('ui.ws.storage.test')}
					</Button>
				{/if}
				{#if model.provider !== 'clinks' || model.stored}
					<Button type="submit" disabled={model.busy}>{workspace.t('ui.save')}</Button>
				{/if}
			</div>
			<p class="text-muted-foreground text-xs">{workspace.t('ui.ws.storage.preview_note')}</p>
		</form>
	{/if}
</ModuleGate>
