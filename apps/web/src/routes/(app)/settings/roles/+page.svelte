<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Lock from '@lucide/svelte/icons/lock';
	import * as Card from '@clinks/ui/components/ui/card';
	import * as Dialog from '@clinks/ui/components/ui/dialog';
	import { Button } from '@clinks/ui/components/ui/button';
	import { Input } from '@clinks/ui/components/ui/input';
	import { Checkbox } from '@clinks/ui/components/ui/checkbox';
	import PageHeader from '#lib/components/common/PageHeader.svelte';
	import AsyncView from '#lib/components/common/AsyncView.svelte';
	import FormField from '#lib/components/common/FormField.svelte';
	import ModuleGate from '#lib/components/shell/ModuleGate.svelte';
	import { RolesModel } from '#lib/features/settings/settings.svelte';
	import { permissionAreas, roleGrants } from '@clinks/domain/permissions';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new RolesModel(workspace);
	const areas = permissionAreas();
	onMount(() => model.resource.connect());

	async function save(event: SubmitEvent) {
		event.preventDefault();
		await model.save();
	}
</script>

<svelte:head><title>{workspace.t('ui.ws.settings.roles')} · CLinks</title></svelte:head>

<ModuleGate permission="roles.manage">
	<PageHeader title={workspace.t('ui.ws.settings.roles')} description={workspace.t('ui.ws.roles.text')}>
		{#snippet actions()}<Button onclick={() => model.edit(null)}>
				<Plus class="size-4" />{workspace.t('ui.ws.roles.new')}
			</Button>{/snippet}
	</PageHeader>
	<AsyncView resource={model.resource}>
		{#snippet children({ roles })}
			<Card.Root>
				<Card.Content class="overflow-x-auto">
					<table class="w-full min-w-[640px] text-sm">
						<caption class="sr-only">{workspace.t('ui.ws.roles.matrix')}</caption>
						<thead>
							<tr class="border-b">
								<th class="py-2 pr-4 text-left font-medium">
									{workspace.t('ui.ws.roles.area')}
								</th>{#each roles as role (role.id)}<th class="px-2 py-2 text-center font-medium">
										<button
											class="hover:underline disabled:no-underline"
											disabled={role.kind !== 'custom'}
											onclick={() => model.edit(role)}
										>
											{role.name}
										</button>{#if role.kind !== 'custom'}<Lock
												class="text-muted-foreground ml-1 inline size-3"
												aria-label={workspace.t('ui.ws.roles.protected')}
											/>{/if}<span class="text-muted-foreground block text-xs font-normal">
											{workspace.t('ui.ws.roles.members', { count: model.usage(role.id) })}
										</span>
									</th>{/each}
							</tr>
						</thead>
						<tbody>
							{#each areas as area (area.area)}
								<tr class="border-b last:border-0">
									<th scope="row" class="py-2 pr-4 text-left font-normal">
										{workspace.t(`ui.ws.roles.area_${area.area}`)}
									</th>
									{#each roles as role (role.id)}
										<td class="px-2 py-2 text-center text-xs">
											{#if area.write && roleGrants(role, area.write)}<span
													class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300"
												>
													{workspace.t('ui.ws.roles.write')}
												</span>{:else if area.read && roleGrants(role, area.read)}<span
													class="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-300"
												>
													{workspace.t('ui.ws.roles.read')}
												</span>{:else}<span class="text-muted-foreground">–</span>{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</Card.Content>
			</Card.Root>
			<p class="text-muted-foreground mt-2 text-xs">{workspace.t('ui.ws.roles.hint')}</p>
		{/snippet}
	</AsyncView>
</ModuleGate>

<Dialog.Root open={model.editing !== null} onOpenChange={(open) => !open && (model.editing = null)}>
	<Dialog.Content closeLabel={workspace.t('ui.ws.close')} class="sm:max-w-lg">
		{#if model.editing}
			<Dialog.Header>
				<Dialog.Title>
					{model.editing.id ? workspace.t('ui.ws.roles.edit') : workspace.t('ui.ws.roles.new')}
				</Dialog.Title>
			</Dialog.Header>
			<form id="role-form" class="space-y-4" onsubmit={save} novalidate>
				<FormField id="role-name" label={workspace.t('ui.ws.contacts.name')} error={model.fields.name}>
					<Input id="role-name" bind:value={model.editing.name} aria-invalid={!!model.fields.name} />
				</FormField>
				<fieldset class="max-h-80 space-y-1 overflow-y-auto">
					<legend class="mb-2 text-sm font-medium">{workspace.t('ui.permissions')}</legend>
					{#each areas as area (area.area)}
						<div class="flex items-center gap-4 rounded-md px-2 py-1 text-sm hover:bg-muted">
							<span class="flex-1">{workspace.t(`ui.ws.roles.area_${area.area}`)}</span>
							{#if area.read}<label class="flex items-center gap-1.5">
									<Checkbox
										checked={model.editing.permissions.includes(area.read)}
										onCheckedChange={() => model.toggle(area.read!)}
									/>{workspace.t('ui.ws.roles.read')}
								</label>{/if}
							{#if area.write}<label class="flex items-center gap-1.5">
									<Checkbox
										checked={model.editing.permissions.includes(area.write)}
										onCheckedChange={() => model.toggle(area.write!)}
									/>{workspace.t(area.read ? 'ui.ws.roles.write' : 'ui.ws.roles.allowed')}
								</label>{/if}
						</div>
					{/each}
				</fieldset>
			</form>
			<Dialog.Footer>
				{#if model.editing.id}{@const role = model.resource.data?.roles.find(
						(candidate) => candidate.id === model.editing?.id,
					)}{#if role}<Button
							variant="ghost"
							class="text-destructive mr-auto"
							onclick={async () => {
								await model.remove(role);
								model.editing = null;
							}}
						>
							{workspace.t('ui.ws.delete')}
						</Button>{/if}{/if}
				<Button variant="outline" onclick={() => (model.editing = null)}>{workspace.t('ui.ws.cancel')}</Button>
				<Button type="submit" form="role-form" disabled={model.busy}>{workspace.t('ui.save')}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
