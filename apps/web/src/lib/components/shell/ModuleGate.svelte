<script lang="ts">
	import type { Snippet } from 'svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { Button } from '@clinks/ui-shared/components/ui/button';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import Forbidden from '#lib/components/common/Forbidden.svelte';
	import type { ModuleKey, Permission } from '#lib/domain/types';
	import { href } from '#lib/navigation';
	import { useWorkspace } from '#lib/workspace.svelte';

	let { module, permission, children }: { module?: ModuleKey; permission?: Permission; children: Snippet } = $props();
	const workspace = useWorkspace();
	const session = workspace.session;
</script>

{#if module && !session.hasModule(module)}
	<EmptyState
		icon={Sparkles}
		title={workspace.t('ui.ws.gate.not_booked_title', { module: workspace.t(`ui.ws.module.${module}`) })}
		description={workspace.t('ui.ws.gate.not_booked_text')}
	>
		{#snippet action()}
			{#if session.can('billing.manage')}
				<Button href={href(`/settings/billing?module=${module}`)}>{workspace.t('ui.ws.gate.upgrade')}</Button>
			{:else}
				<p class="text-muted-foreground text-sm">{workspace.t('ui.ws.gate.ask_admin')}</p>
			{/if}
		{/snippet}
	</EmptyState>
{:else if permission && !session.can(permission)}
	<Forbidden />
{:else}
	{@render children()}
{/if}
