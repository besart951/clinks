<script lang="ts" generics="T">
	import { untrack, type Snippet } from 'svelte';
	import type { ListModel } from '#lib/features/list/list-model.svelte';
	import ListRow from './ListRow.svelte';

	/**
	 * A list whose entries are selected and acted on the same way everywhere (see `ListModel`). `row` renders
	 * an entry's content, `empty` what shows without entries. Its keys work page-wide once the page registers the
	 * list with `workspace.registerPageKeys`.
	 */
	let {
		list,
		row,
		empty,
		class: className = '',
	}: { list: ListModel<T, string>; row: Snippet<[T]>; empty?: Snippet; class?: string } = $props();

	let element: HTMLUListElement;

	/** After a move by key the anchor row gets focus, so the keyboard and screen readers follow the selection. */
	$effect(() => {
		if (list.moved === 0) return;
		const id = untrack(() => list.anchor);
		const row = id ? element.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"] [data-row-main]`) : null;
		row?.focus({ preventScroll: true });
		row?.scrollIntoView({ block: 'nearest' });
	});
</script>

<ul
	bind:this={element}
	class="{list.layout === 'tiles' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4' : 'divide-y'} {className}"
	aria-label={list.name}
>
	{#each list.items as item (list.id(item))}
		<ListRow {list} {item}>{@render row(item)}</ListRow>
	{:else}
		{#if empty}<li>{@render empty()}</li>{/if}
	{/each}
</ul>
