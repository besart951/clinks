<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { ListModel } from '#lib/features/list/list-model.svelte';
	import ListRow from './ListRow.svelte';

	/**
	 * A list whose entries are selected and acted on the same way everywhere (see `ListModel`). `row` renders
	 * an entry's content, `empty` what shows without entries.
	 */
	let {
		list,
		row,
		empty,
		class: className = '',
	}: { list: ListModel<T, string>; row: Snippet<[T]>; empty?: Snippet; class?: string } = $props();

	/** The list's keys, caught as they bubble up from a focused row (delegation, not a widget of its own). */
	function keys(element: HTMLElement) {
		function keydown(event: KeyboardEvent) {
			// Keys typed into a field inside a row stay with the field.
			if ((event.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
			if (list.keydown(event)) event.preventDefault();
		}
		element.addEventListener('keydown', keydown);
		return () => element.removeEventListener('keydown', keydown);
	}
</script>

<ul class="divide-y {className}" aria-label={list.name} {@attach keys}>
	{#each list.items as item (list.id(item))}
		<ListRow {list} {item}>{@render row(item)}</ListRow>
	{:else}
		{#if empty}<li>{@render empty()}</li>{/if}
	{/each}
</ul>
