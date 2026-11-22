<script lang="ts">
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import * as DropdownMenu from '@clinks/ui-shared/components/ui/dropdown-menu';
	import { toast } from 'svelte-sonner';
	import { navigate } from '#lib/navigation';
	import type { Tenant } from '#lib/domain/types';
	import { useWorkspace } from '#lib/workspace.svelte';

	const workspace = useWorkspace();
	const session = workspace.session;

	async function choose(tenant: Tenant) {
		if (tenant.id === session.tenantId) return;
		await session.switchTenant(tenant.id);
		toast.success(workspace.t('ui.ws.shell.switched_tenant', { name: tenant.name }));
		await navigate('/dashboard');
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class="hover:bg-sidebar-accent flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left"
				aria-label={workspace.t('ui.workspace')}
			>
				{#if session.tenant?.logoDataUrl}
					<img src={session.tenant.logoDataUrl} alt="" class="size-5 shrink-0 rounded-md object-cover" />
				{:else}
					<span
						class="grid size-5 shrink-0 place-items-center rounded-md"
						style:background-color={session.tenant?.brandColor ?? '#18181b'}
						aria-hidden="true"
					>
						<span class="size-1.5 rounded-full bg-white"></span>
					</span>
				{/if}
				<span class="flex-1 truncate text-[15px] font-semibold">{session.tenant?.name}</span>
				<ChevronsUpDown class="text-muted-foreground size-3.5 shrink-0" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-64">
		<DropdownMenu.Label>{workspace.t('ui.workspace_description')}</DropdownMenu.Label>
		{#each session.tenants as tenant (tenant.id)}
			<DropdownMenu.Item onclick={() => choose(tenant)}>
				<span class="size-2.5 rounded-full" style:background-color={tenant.brandColor}></span>
				<span class="flex-1 truncate">{tenant.name}</span>
				{#if tenant.id === session.tenantId}<Check class="size-4" />{/if}
			</DropdownMenu.Item>
		{/each}
		<DropdownMenu.Separator />
		<DropdownMenu.Item onclick={() => navigate('/onboarding')}>
			<Plus class="size-4" />{workspace.t('ui.ws.shell.new_tenant')}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
