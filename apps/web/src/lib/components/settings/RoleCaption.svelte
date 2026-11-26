<script lang="ts">
	import type { Role } from '@clinks/domain/types';
	import type { RolesModel } from '#lib/features/settings/roles.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Under a role's name: members, protected or template, and rights that rest because a product is not booked. */
	let { model, role }: { model: RolesModel; role: Role } = $props();
	const workspace = useWorkspace();
	const product = $derived(model.templateProduct(role));
	const dormant = $derived(model.dormant(role));
</script>

<span class="text-muted-foreground block text-xs font-normal">
	{[
		workspace.t('ui.ws.roles.members', { count: model.usage(role.id) }),
		role.kind !== 'custom' ? workspace.t('ui.ws.roles.protected') : '',
		product ? workspace.t('ui.ws.roles.template', { product: workspace.t(`ui.ws.roles.group_${product}`) }) : '',
	]
		.filter(Boolean)
		.join(' · ')}
</span>
{#if dormant.length > 0}<span class="block text-xs font-normal text-amber-700 dark:text-amber-400">
		{workspace.t('ui.ws.roles.dormant', {
			products: dormant.map((key) => workspace.t(`ui.ws.roles.group_${key}`)).join(', '),
		})}
	</span>{/if}
