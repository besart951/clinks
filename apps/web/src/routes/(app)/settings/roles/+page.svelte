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
	import ChipChoice from '#lib/components/common/ChipChoice.svelte';
	import RightLevel from '#lib/components/settings/RightLevel.svelte';
	import RoleCaption from '#lib/components/settings/RoleCaption.svelte';
	import { RolesModel } from '#lib/features/settings/roles.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const model = new RolesModel(workspace);
	/** The role shown on a phone. */
	let phoneRole = $state<string | null>(null);
	onMount(() => model.resource.connect());
	const editingRole = $derived(model.resource.data?.roles.find((role) => role.id === model.editing?.id) ?? null);

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
		{#snippet children(data)}
			{@const roles = model.available(data.roles)}
			{@const shown = roles.find((role) => role.id === phoneRole) ?? roles[0]}
			<!-- Phones: one role at a time, its rights as a list per product; the matrix needs a wide screen. -->
			<div class="space-y-3 md:hidden">
				<ChipChoice
					items={roles.map((role) => ({ ...role, key: role.id }))}
					selected={shown?.id ?? null}
					label={workspace.t('ui.ws.settings.roles')}
					onselect={(role) => (phoneRole = role.id)}
				>
					{#snippet chip(role)}
						{role.name}{#if role.kind !== 'custom'}<Lock class="size-3" aria-hidden="true" />{/if}
					{/snippet}
				</ChipChoice>
				{#if shown}
					<Card.Root>
						<Card.Header>
							<Card.Title>{shown.name}</Card.Title>
							<Card.Description><RoleCaption {model} role={shown} /></Card.Description>
							{#if shown.kind === 'custom'}<Card.Action>
									<Button variant="outline" size="sm" onclick={() => model.edit(shown)}>
										{workspace.t('ui.ws.roles.edit')}
									</Button>
								</Card.Action>{/if}
						</Card.Header>
						<Card.Content class="space-y-4">
							{#each model.groups as group (group.product)}
								<section aria-labelledby="phone-{group.product}">
									<h3 id="phone-{group.product}" class="text-muted-foreground text-xs font-medium">
										{workspace.t(`ui.ws.roles.group_${group.product}`)}
									</h3>
									<ul class="divide-y text-sm">
										{#each group.areas as area (area.area)}
											<li class="flex min-h-10 items-center justify-between gap-3">
												<span>{workspace.t(`ui.ws.roles.area_${area.area}`)}</span>
												<RightLevel role={shown} {area} />
											</li>
										{/each}
									</ul>
								</section>
							{/each}
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
			<Card.Root class="hidden md:flex">
				<Card.Content class="overflow-x-auto">
					<table class="w-full min-w-[560px] text-sm">
						<caption class="sr-only">{workspace.t('ui.ws.roles.matrix')}</caption>
						<thead>
							<tr class="border-b">
								<th class="bg-card sticky left-0 z-10 py-2 pr-4 text-left font-medium">
									{workspace.t('ui.ws.roles.area')}
								</th>{#each roles as role (role.id)}<th class="px-2 py-2 text-center align-top font-medium">
										<button
											class="hover:underline disabled:no-underline"
											disabled={role.kind !== 'custom'}
											onclick={() => model.edit(role)}
										>
											{role.name}
										</button>{#if role.kind !== 'custom'}<Lock
												class="text-muted-foreground ml-1 inline size-3"
												aria-label={workspace.t('ui.ws.roles.protected')}
											/>{/if}
										<RoleCaption {model} {role} />
									</th>{/each}
							</tr>
						</thead>
						{#each model.groups as group (group.product)}
							<tbody>
								<tr>
									<th
										scope="rowgroup"
										colspan={roles.length + 1}
										class="bg-card text-muted-foreground sticky left-0 pt-4 pb-1 text-left text-xs font-medium"
									>
										{workspace.t(`ui.ws.roles.group_${group.product}`)}
									</th>
								</tr>
								{#each group.areas as area (area.area)}
									<tr class="border-b last:border-0">
										<th scope="row" class="bg-card sticky left-0 z-10 py-2 pr-4 text-left font-normal">
											{workspace.t(`ui.ws.roles.area_${area.area}`)}
										</th>
										{#each roles as role (role.id)}
											<td class="px-2 py-2 text-center"><RightLevel {role} {area} /></td>
										{/each}
									</tr>
								{/each}
							</tbody>
						{/each}
					</table>
				</Card.Content>
			</Card.Root>
			<p class="text-muted-foreground mt-2 hidden text-xs md:block">{workspace.t('ui.ws.roles.hint')}</p>
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
				{#if editingRole}<Dialog.Description><RoleCaption {model} role={editingRole} /></Dialog.Description>{/if}
			</Dialog.Header>
			<form id="role-form" class="space-y-4" onsubmit={save} novalidate>
				<FormField id="role-name" label={workspace.t('ui.ws.contacts.name')} error={model.fields.name}>
					<Input id="role-name" bind:value={model.editing.name} aria-invalid={!!model.fields.name} />
				</FormField>
				<div class="max-h-96 space-y-4 overflow-y-auto">
					{#each model.groups as group (group.product)}
						<fieldset class="space-y-1">
							<legend class="text-muted-foreground mb-1 text-xs font-medium">
								{workspace.t(`ui.ws.roles.group_${group.product}`)}
							</legend>
							{#each group.areas as area (area.area)}
								<div class="hover:bg-muted flex items-center gap-4 rounded-md px-2 py-1 text-sm">
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
					{/each}
				</div>
			</form>
			<Dialog.Footer class="flex-wrap">
				{#if editingRole}<Button
						variant="ghost"
						class="text-destructive mr-auto"
						onclick={async () => {
							await model.remove(editingRole);
							model.editing = null;
						}}
					>
						{workspace.t('ui.ws.delete')}
					</Button>{#if editingRole.template}<Button variant="outline" onclick={() => model.reset(editingRole)}>
							{workspace.t('ui.ws.roles.reset')}
						</Button>{/if}{/if}
				<Button variant="outline" onclick={() => (model.editing = null)}>{workspace.t('ui.ws.cancel')}</Button>
				<Button type="submit" form="role-form" disabled={model.busy}>{workspace.t('ui.save')}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
