<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '@clinks/ui-shared/components/ui/card';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import { Input } from '@clinks/ui-shared/components/ui/input';
	import PageHeader from '$lib/components/common/PageHeader.svelte';
	import FormField from '$lib/components/common/FormField.svelte';
	import Choice from '$lib/components/common/Choice.svelte';
	import UnsavedChangesGuard from '$lib/components/common/UnsavedChangesGuard.svelte';
	import ModuleGate from '$lib/components/shell/ModuleGate.svelte';
	import { CompanySettingsModel } from '$lib/features/settings/settings.svelte';
	import { isValidSwissIban } from '$lib/domain/qr-bill';
	import { useWorkspace } from '$lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new CompanySettingsModel(workspace);
	onMount(() => model.load());
	const ibanInvalid = $derived(model.value.iban.trim() !== '' && !isValidSwissIban(model.value.iban));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void model.save();
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.company')} · CLinks</title></svelte:head>
<UnsavedChangesGuard dirty={model.dirty} />

<ModuleGate permission="settings.manage">
	<PageHeader title={workspace.t('ui.ws.settings.company')} description={workspace.t('ui.ws.settings.company_text')} />
	<form class="space-y-6" onsubmit={submit} novalidate>
		<Card.Root>
			<Card.Header><Card.Title>{workspace.t('ui.ws.settings.appearance')}</Card.Title></Card.Header>
			<Card.Content class="flex flex-wrap items-center gap-6">
				<div
					class="grid size-16 place-items-center overflow-hidden rounded-xl border"
					style:background-color={model.value.logoDataUrl ? undefined : model.value.brandColor}
				>
					{#if model.value.logoDataUrl}<img
							src={model.value.logoDataUrl}
							alt={workspace.t('ui.ws.settings.logo')}
							class="size-16 object-contain"
						/>{:else}<span class="text-xl font-bold text-white">{model.value.name.slice(0, 1)}</span>{/if}
				</div>
				<div class="space-y-2">
					<FormField id="logo" label={workspace.t('ui.ws.settings.logo')}
						><Input
							id="logo"
							type="file"
							accept="image/*"
							onchange={(event) => model.setLogo(event.currentTarget.files?.[0])}
						/></FormField
					>
					{#if model.value.logoDataUrl}<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => (model.value.logoDataUrl = null)}>{workspace.t('ui.ws.settings.remove_logo')}</Button
						>{/if}
				</div>
				<FormField id="brand" label={workspace.t('ui.ws.settings.brand_color')}
					><Input id="brand" type="color" class="h-9 w-20 p-1" bind:value={model.value.brandColor} /></FormField
				>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header><Card.Title>{workspace.t('ui.ws.settings.company_data')}</Card.Title></Card.Header>
			<Card.Content class="grid gap-4 sm:grid-cols-2">
				<FormField id="co-name" label={workspace.t('ui.tenant_name')} class="sm:col-span-2" error={model.fields.name}
					><Input id="co-name" bind:value={model.value.name} /></FormField
				>
				<FormField id="co-street" label={workspace.t('ui.ws.field.street')} class="sm:col-span-2"
					><Input id="co-street" bind:value={model.value.address.street} /></FormField
				>
				<FormField id="co-zip" label={workspace.t('ui.ws.field.zip')}
					><Input id="co-zip" bind:value={model.value.address.zip} /></FormField
				>
				<FormField id="co-city" label={workspace.t('ui.ws.field.city')}
					><Input id="co-city" bind:value={model.value.address.city} /></FormField
				>
				<FormField id="co-vat" label={workspace.t('ui.ws.settings.vat_number')}
					><Input id="co-vat" bind:value={model.value.vatNumber} placeholder="CHE-123.456.789 MWST" /></FormField
				>
				<FormField id="co-locale" label={workspace.t('ui.ws.settings.default_language')}
					><Choice
						id="co-locale"
						bind:value={model.value.locale}
						options={[
							{ value: 'de-CH', label: 'Deutsch (Schweiz)' },
							{ value: 'en-US', label: 'English' },
						]}
					/></FormField
				>
				<FormField id="co-zone" label={workspace.t('ui.ws.settings.time_zone')}
					><Choice
						id="co-zone"
						bind:value={model.value.timeZone}
						options={['Europe/Zurich', 'Europe/Berlin', 'Europe/Vienna'].map((zone) => ({ value: zone, label: zone }))}
					/></FormField
				>
				<FormField
					id="co-iban"
					label={workspace.t('ui.ws.settings.iban')}
					error={ibanInvalid ? workspace.t('ui.ws.settings.iban_invalid') : undefined}
					hint={workspace.t('ui.ws.settings.iban_hint')}
					><Input id="co-iban" bind:value={model.value.iban} aria-invalid={ibanInvalid} /></FormField
				>
			</Card.Content>
		</Card.Root>
		<div class="flex justify-end">
			<Button type="submit" disabled={!model.dirty || model.busy}>{workspace.t('ui.save')}</Button>
		</div>
	</form>
</ModuleGate>
