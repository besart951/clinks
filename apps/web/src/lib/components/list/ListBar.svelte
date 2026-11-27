<script lang="ts" generics="T">
	import X from '@lucide/svelte/icons/x';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { Button } from '@clinks/ui/components/ui/button';
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import type { ListModel } from '#lib/features/list/list-model.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';
	import ListMenuItems from './ListMenuItems.svelte';

	/** The bar for several selected entries: their count, the actions for all of them and «select all». */
	let { list, class: className = '' }: { list: ListModel<T, string>; class?: string } = $props();
	const workspace = useWorkspace();
	const items = $derived(list.selected);
	const actions = $derived(list.actionsFor(items));
	/** The common ones as buttons; the rest, submenus included, behind «…». */
	const buttons = $derived(actions.filter((action) => action.inline && !action.choices));
</script>

{#if list.many}
	<div
		class="bg-muted flex flex-wrap items-center gap-1 rounded-lg px-2 py-1.5 text-sm {className}"
		role="region"
		aria-label={workspace.t('ui.ws.selection')}
	>
		<Button
			variant="ghost"
			size="icon-sm"
			onclick={() => list.clear()}
			aria-label={workspace.t('ui.ws.list.clear_selection')}
		>
			<X class="size-4" />
		</Button>
		<span class="font-medium" aria-live="polite">{workspace.t('ui.ws.selected', { count: items.length })}</span>
		{#if items.length < list.items.length}
			<Button variant="link" size="sm" onclick={() => list.selectAll()} aria-keyshortcuts="Control+A">
				{workspace.t('ui.ws.select_all')}
			</Button>
		{/if}
		<div class="flex-1"></div>
		{#each buttons as action (action.id)}
			{@const Icon = action.icon(items)}
			<Button
				variant="ghost"
				size="icon-sm"
				class={action.destructive ? 'text-destructive' : ''}
				aria-label={action.label(items)}
				title={action.label(items)}
				disabled={items.length === 0}
				onclick={() => list.run(action, items)}
			>
				<Icon class="size-4" />
			</Button>
		{/each}
		{#if items.length > 0 && actions.length > buttons.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							aria-label={workspace.t('ui.ws.list.more_actions')}
						>
							<Ellipsis class="size-4" />
						</Button>{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-60">
					<ListMenuItems {list} {items} kind="dropdown" />
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>
{/if}
