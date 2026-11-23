<script lang="ts">
	import { dataLocation, storageProviders, type StorageProvider } from '@clinks/domain/storage';
	import type { StorageSettingsModel } from '#lib/features/settings/storage.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model }: { model: StorageSettingsModel } = $props();
	const workspace = useWorkspace();

	/** The location a provider has before any endpoint is chosen; R2 depends on the jurisdiction picked later. */
	function locationKey(provider: StorageProvider) {
		const location = provider === 'cloudflare' ? 'eu' : dataLocation(provider, '');
		return `ui.ws.storage.location_${location}`;
	}
</script>

<fieldset class="grid gap-3 sm:grid-cols-2">
	<legend class="mb-3 text-sm font-medium">{workspace.t('ui.ws.storage.provider')}</legend>
	{#each storageProviders as provider (provider)}
		<label
			class="hover:bg-muted/50 has-[:checked]:border-foreground has-[:checked]:ring-foreground has-[:focus-visible]:ring-ring relative flex cursor-pointer flex-col gap-1 rounded-lg border p-4 has-[:checked]:ring-1 has-[:focus-visible]:ring-2"
		>
			<span class="flex items-center justify-between gap-3">
				<span class="flex items-center gap-2 font-medium">
					<input
						type="radio"
						name="storage-provider"
						value={provider}
						class="accent-foreground size-4"
						checked={model.provider === provider}
						aria-labelledby="storage-{provider}-name"
						aria-describedby="storage-{provider}-location storage-{provider}-text"
						onchange={() => model.selectProvider(provider)}
					/>
					<span id="storage-{provider}-name">{workspace.t(`ui.ws.storage.provider_${provider}`)}</span>
				</span>
				<span class="text-muted-foreground rounded-full border px-2 py-0.5 text-xs" id="storage-{provider}-location">
					{workspace.t(locationKey(provider))}
				</span>
			</span>
			<span id="storage-{provider}-text" class="text-muted-foreground ps-6 text-sm">
				{workspace.t(`ui.ws.storage.provider_${provider}_text`)}
			</span>
		</label>
	{/each}
</fieldset>
