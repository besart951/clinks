<script lang="ts" generics="T">
	import * as DropdownMenu from '@clinks/ui/components/ui/dropdown-menu';
	import * as ContextMenu from '@clinks/ui/components/ui/context-menu';
	import type { ListAction, ListModel } from '#lib/features/list/list-model.svelte';
	import { keyLabel } from './key-label';

	/** The actions as menu items, in a right-click menu or in an «…» menu; destructive ones last, set apart. */
	let { list, items, kind }: { list: ListModel<T, string>; items: T[]; kind: 'context' | 'dropdown' } = $props();
	// Both menus offer the same parts; the dropdown's types stand for both.
	const Menu = $derived((kind === 'context' ? ContextMenu : DropdownMenu) as typeof DropdownMenu);
	const actions = $derived(list.actionsFor(items));
	const safe = $derived(actions.filter((action) => !action.destructive));
	const destructive = $derived(actions.filter((action) => action.destructive));
</script>

{#snippet entry(action: ListAction<T>)}
	{@const Icon = action.icon(items)}
	{#if action.choices}
		{@const choices = action.choices(items)}
		{#if choices.length > 0}
			<Menu.Sub>
				<Menu.SubTrigger><Icon />{action.label(items)}</Menu.SubTrigger>
				<Menu.SubContent class="max-h-80 w-64 overflow-y-auto">
					{#each choices as choice (choice.id)}
						{@const ChoiceIcon = choice.icon}
						<Menu.Item onclick={() => list.choose(choice, items)}>
							{#if ChoiceIcon}<ChoiceIcon class="text-muted-foreground" />{/if}
							<span class="truncate">{choice.label}</span>
						</Menu.Item>
					{/each}
				</Menu.SubContent>
			</Menu.Sub>
		{/if}
	{:else}
		<Menu.Item variant={action.destructive ? 'destructive' : 'default'} onclick={() => list.run(action, items)}>
			<Icon />{action.label(items)}
			{#if action.key}<Menu.Shortcut>{keyLabel(action.key)}</Menu.Shortcut>{/if}
		</Menu.Item>
	{/if}
{/snippet}

{#each safe as action (action.id)}{@render entry(action)}{/each}
{#if safe.length > 0 && destructive.length > 0}<Menu.Separator />{/if}
{#each destructive as action (action.id)}{@render entry(action)}{/each}
