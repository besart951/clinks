<script lang="ts">
	import { Input } from '@clinks/ui/components/ui/input';
	import { Switch } from '@clinks/ui/components/ui/switch';
	import { Label } from '@clinks/ui/components/ui/label';
	import { infomaniakRegions } from '@clinks/domain/storage';
	import FormField from '#lib/components/common/FormField.svelte';
	import Choice from '#lib/components/common/Choice.svelte';
	import type { StorageSettingsModel } from '#lib/features/settings/storage.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { model }: { model: StorageSettingsModel } = $props();
	const workspace = useWorkspace();
	let showSecret = $state(false);

	/** Links a field to its error (or hint) only while that text is shown. */
	function describedBy(id: string, hint = false) {
		return model.fields[fieldName(id)] ? `${id}-error` : hint ? `${id}-hint` : undefined;
	}

	function fieldName(id: string) {
		return id.replace('storage-', '');
	}

	const identifier = { autocomplete: 'off', autocapitalize: 'none', spellcheck: false, autocorrect: 'off' } as const;
</script>

<div class="grid gap-4 sm:grid-cols-2">
	{#if model.provider === 'infomaniak'}
		<FormField
			id="storage-region"
			label={workspace.t('ui.ws.storage.datacenter')}
			hint={model.connection.endpoint}
			error={model.fields.region}
			class="sm:col-span-2"
		>
			<Choice
				id="storage-region"
				value={model.connection.region}
				onchange={(region) => model.selectInfomaniakRegion(region)}
				invalid={!!model.fields.region}
				options={infomaniakRegions.map((entry) => ({
					value: entry.region,
					label: `${entry.region} · ${entry.endpoint.replace('https://', '')}`,
				}))}
			/>
		</FormField>
	{:else if model.provider === 'cloudflare'}
		<FormField
			id="storage-account"
			label={workspace.t('ui.ws.storage.cloudflare_account')}
			hint={workspace.t('ui.ws.storage.cloudflare_account_hint')}
			error={model.fields.endpoint}
		>
			<Input
				id="storage-account"
				{...identifier}
				class="font-mono"
				bind:value={model.r2.accountId}
				aria-invalid={!!model.fields.endpoint}
				aria-describedby={model.fields.endpoint ? 'storage-account-error' : 'storage-account-hint'}
			/>
		</FormField>
		<FormField
			id="storage-jurisdiction"
			label={workspace.t('ui.ws.storage.cloudflare_jurisdiction')}
			hint={model.endpoint}
		>
			<Choice
				id="storage-jurisdiction"
				bind:value={model.r2.jurisdiction}
				options={[
					{ value: 'eu', label: workspace.t('ui.ws.storage.cloudflare_jurisdiction_eu') },
					{ value: 'default', label: workspace.t('ui.ws.storage.cloudflare_jurisdiction_default') },
				]}
			/>
		</FormField>
	{:else}
		<FormField
			id="storage-endpoint"
			label={workspace.t('ui.ws.storage.endpoint')}
			hint={workspace.t('ui.ws.storage.endpoint_hint')}
			error={model.fields.endpoint}
			class="sm:col-span-2"
		>
			<Input
				id="storage-endpoint"
				type="url"
				inputmode="url"
				{...identifier}
				class="font-mono"
				placeholder="https://s3.example.ch"
				bind:value={model.connection.endpoint}
				aria-invalid={!!model.fields.endpoint}
				aria-describedby={describedBy('storage-endpoint', true)}
			/>
		</FormField>
		<FormField id="storage-region" label={workspace.t('ui.ws.storage.region')} error={model.fields.region}>
			<Input
				id="storage-region"
				{...identifier}
				class="font-mono"
				bind:value={model.connection.region}
				aria-invalid={!!model.fields.region}
				aria-describedby={describedBy('storage-region')}
			/>
		</FormField>
		<div class="flex items-center justify-between gap-4 self-end pb-2">
			<Label for="storage-path-style">{workspace.t('ui.ws.storage.path_style')}</Label>
			<Switch id="storage-path-style" bind:checked={model.connection.pathStyle} />
		</div>
	{/if}

	<FormField
		id="storage-bucket"
		label={workspace.t('ui.ws.storage.bucket')}
		hint={workspace.t('ui.ws.storage.bucket_hint')}
		error={model.fields.bucket}
		class="sm:col-span-2"
	>
		<Input
			id="storage-bucket"
			{...identifier}
			class="font-mono"
			bind:value={model.connection.bucket}
			aria-invalid={!!model.fields.bucket}
			aria-describedby={describedBy('storage-bucket', true)}
		/>
	</FormField>
	<FormField id="storage-accessKeyId" label={workspace.t('ui.ws.storage.access_key')} error={model.fields.accessKeyId}>
		<Input
			id="storage-accessKeyId"
			{...identifier}
			class="font-mono"
			bind:value={model.connection.accessKeyId}
			aria-invalid={!!model.fields.accessKeyId}
			aria-describedby={describedBy('storage-accessKeyId')}
		/>
	</FormField>
	<FormField
		id="storage-secretAccessKey"
		label={workspace.t('ui.ws.storage.secret_key')}
		hint={model.keepsSecret
			? workspace.t('ui.ws.storage.secret_kept', { hint: model.stored?.secretHint ?? '' })
			: workspace.t('ui.ws.storage.secret_hint')}
		error={model.fields.secretAccessKey}
	>
		<div class="flex gap-2">
			<Input
				id="storage-secretAccessKey"
				type={showSecret ? 'text' : 'password'}
				autocomplete="off"
				spellcheck={false}
				class="font-mono"
				placeholder={model.keepsSecret ? `••••${model.stored?.secretHint ?? ''}` : ''}
				bind:value={model.secret}
				aria-invalid={!!model.fields.secretAccessKey}
				aria-describedby={describedBy('storage-secretAccessKey', true)}
			/>
			<button
				type="button"
				class="hover:bg-muted shrink-0 rounded-md border px-3 text-sm"
				aria-pressed={showSecret}
				aria-controls="storage-secretAccessKey"
				onclick={() => (showSecret = !showSecret)}
			>
				{workspace.t(showSecret ? 'ui.ws.storage.hide_secret' : 'ui.ws.storage.show_secret')}
			</button>
		</div>
	</FormField>
</div>
