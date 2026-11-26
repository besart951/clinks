<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { Button } from '@clinks/ui/components/ui/button';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import AttributeList from '#lib/components/kit/AttributeList.svelte';
	import SettingsCard from '@clinks/ui/kit/SettingsCard.svelte';
	import { CompanySettingsModel } from '#lib/features/settings/settings.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;
	const model = new CompanySettingsModel(workspace);
	let logoInput: HTMLInputElement;
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.company')} · CLinks</title></svelte:head>

<ModuleGate permission="settings.manage">
	<header class="mb-6">
		<h1 class="text-[30px] leading-9 font-semibold tracking-tight">{workspace.t('ui.ws.settings.company')}</h1>
		<p class="text-muted-foreground mt-1 text-sm">{workspace.t('ui.ws.settings.company_inline_text')}</p>
	</header>
	{#if session.tenant}
		{@const tenant = session.tenant}
		<div class="grid items-start gap-4 xl:grid-cols-2">
			<SettingsCard
				card={{
					title: workspace.t('ui.ws.settings.company_data'),
					description: workspace.t('ui.ws.settings.company_text'),
				}}
			>
				<AttributeList
					list={{ fields: model.fields(tenant) }}
					onsave={(field, value) => model.saveField(field, value)}
				/>
			</SettingsCard>
			<div class="grid gap-4">
				<SettingsCard
					card={{
						title: workspace.t('ui.ws.settings.appearance'),
						description: workspace.t('ui.ws.settings.appearance_text'),
					}}
				>
					<div class="flex flex-wrap items-center gap-4 px-1">
						<div
							class="grid size-14 place-items-center overflow-hidden rounded-xl border"
							style:background-color={tenant.logoDataUrl ? undefined : tenant.brandColor}
						>
							{#if tenant.logoDataUrl}<img src={tenant.logoDataUrl} alt="" class="size-full object-cover" />{/if}
						</div>
						<div class="flex flex-wrap gap-2">
							<input
								bind:this={logoInput}
								type="file"
								accept="image/*"
								hidden
								onchange={(event) => model.setLogo(event.currentTarget.files?.[0])}
							/>
							<Button variant="outline" size="sm" onclick={() => logoInput.click()}>
								<Upload class="size-4" />{workspace.t('ui.ws.settings.logo')}
							</Button>
							{#if tenant.logoDataUrl}<Button variant="ghost" size="sm" onclick={() => model.removeLogo()}>
									<Trash2 class="size-4" />{workspace.t('ui.ws.settings.remove_logo')}
								</Button>{/if}
						</div>
						<label class="hover:bg-accent ml-auto flex h-8 items-center gap-2 rounded-md px-2 text-[13px]">
							<span class="text-muted-foreground">{workspace.t('ui.ws.settings.brand_color')}</span>
							<input
								type="color"
								class="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
								value={tenant.brandColor}
								onchange={(event) => model.setBrandColor(event.currentTarget.value)}
							/>
							<span class="font-mono text-xs">{tenant.brandColor}</span>
						</label>
					</div>
				</SettingsCard>
				{#if session.hasModule('finance')}
					<SettingsCard
						card={{
							title: workspace.t('ui.ws.settings.invoicing'),
							description: workspace.t('ui.ws.settings.invoicing_text'),
						}}
					>
						<AttributeList
							list={{ fields: model.invoiceFields(tenant) }}
							onsave={(field, value) => model.saveField(field, value)}
						/>
					</SettingsCard>
				{/if}
				<SettingsCard
					card={{
						title: workspace.t('ui.ws.settings.regional'),
						description: workspace.t('ui.ws.settings.regional_text'),
					}}
				>
					<AttributeList
						list={{ fields: model.regionalFields(tenant) }}
						onsave={(field, value) => model.saveField(field, value)}
					/>
				</SettingsCard>
			</div>
		</div>
	{/if}
</ModuleGate>
