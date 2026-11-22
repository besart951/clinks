<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		tags,
		onsave,
		readonly = false,
	}: { tags: string[]; onsave: (tags: string[]) => unknown; readonly?: boolean } = $props();

	const workspace = useWorkspace();
	let adding = $state(false);
	let draft = $state('');

	function commit() {
		const tag = draft.trim();
		adding = false;
		draft = '';
		if (tag && !tags.includes(tag)) void onsave([...tags, tag]);
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		} else if (event.key === 'Escape') {
			event.stopPropagation();
			adding = false;
			draft = '';
		}
	}
</script>

<div class="flex flex-wrap items-center gap-1.5 px-1">
	{#each tags as tag (tag)}
		<span class="reveal-scope bg-muted inline-flex h-6 items-center gap-1 rounded-full pr-1 pl-2.5 text-xs font-medium">
			{tag}
			{#if !readonly}
				<button
					type="button"
					class="reveal hover:bg-background grid size-4 place-items-center rounded-full"
					aria-label={workspace.t('ui.ws.inline.remove', { field: tag })}
					onclick={() => onsave(tags.filter((entry) => entry !== tag))}
				>
					<X class="size-3" />
				</button>
			{/if}
		</span>
	{:else}
		{#if readonly}<span class="text-muted-foreground text-sm">{workspace.t('ui.ws.inline.empty')}</span>{/if}
	{/each}
	{#if !readonly}
		{#if adding}
			<input
				class="bg-field ring-ring h-6 w-32 rounded-full px-2.5 text-xs ring-1 outline-none focus-visible:outline-none"
				aria-label={workspace.t('ui.ws.inline.add_tag')}
				bind:value={draft}
				onkeydown={keydown}
				onblur={commit}
				{@attach (node) => node.focus()}
			/>
		{:else}
			<button
				type="button"
				class="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-xs"
				onclick={() => (adding = true)}
			>
				<Plus class="size-3" />{workspace.t('ui.ws.inline.add_tag')}
			</button>
		{/if}
	{/if}
</div>
