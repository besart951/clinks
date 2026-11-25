<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import * as Popover from '@clinks/ui/components/ui/popover';
	import { useWorkspace } from '#lib/workspace.svelte';

	let {
		tags,
		onsave,
		suggestions = [],
		readonly = false,
	}: {
		tags: string[];
		onsave: (tags: string[]) => unknown;
		/** Tags already used elsewhere; offered in a dropdown while typing, so a tag is not spelled twice. */
		suggestions?: string[];
		readonly?: boolean;
	} = $props();

	const workspace = useWorkspace();
	const id = $props.id();
	let adding = $state(false);
	let draft = $state('');
	let input = $state<HTMLInputElement | null>(null);
	/** Index of the highlighted option; -1 means the typed text itself. */
	let active = $state(-1);

	const same = (left: string, right: string) => left.localeCompare(right, 'de', { sensitivity: 'accent' }) === 0;
	const has = (list: string[], tag: string) => list.some((entry) => same(entry, tag));

	/** Known tags this contact does not have yet, filtered by what is typed; plus the typed text if it is new. */
	const options = $derived.by(() => {
		const query = draft.trim().toLocaleLowerCase('de');
		const known = suggestions.filter(
			(tag) => !has(tags, tag) && (!query || tag.toLocaleLowerCase('de').includes(query)),
		);
		const typed = draft.trim();
		const fresh = typed && !has(suggestions, typed) && !has(tags, typed);
		return [...known.map((tag) => ({ tag, fresh: false })), ...(fresh ? [{ tag: typed, fresh: true }] : [])];
	});
	const open = $derived(adding && options.length > 0);

	/** Keeps the highlighted option visible in the scrolling list (DOM only). */
	$effect(() => {
		if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
	});

	/** Adds a tag once: an existing spelling wins over the typed one. */
	function add(tag: string) {
		const value = suggestions.find((entry) => same(entry, tag)) ?? tag.trim();
		draft = '';
		active = -1;
		if (value && !has(tags, value)) void onsave([...tags, value]);
	}

	function close() {
		adding = false;
		draft = '';
		active = -1;
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (options.length === 0) return;
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active = (active + step + options.length + 1) % (options.length + 1);
			if (active === options.length) active = -1;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			// An IME uses Enter to confirm its composition; that must not add a tag.
			if (event.isComposing) return;
			if (active >= 0) add(options[active].tag);
			else if (draft.trim()) add(draft);
			else close();
		} else if (event.key === 'Escape') {
			event.stopPropagation();
			close();
		}
	}

	function blur() {
		// Picking an option keeps focus in the field (its pointerdown is prevented), so blur means leaving.
		if (draft.trim()) add(draft);
		close();
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
				bind:this={input}
				class="bg-field ring-ring h-6 w-32 rounded-full px-2.5 text-xs ring-1 outline-none focus-visible:outline-none"
				role="combobox"
				aria-label={workspace.t('ui.ws.inline.add_tag')}
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls="{id}-options"
				aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
				bind:value={draft}
				oninput={() => (active = -1)}
				onkeydown={keydown}
				onblur={blur}
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

<!-- A dropdown in a portal, anchored to the field: the accordion around the editor clips overflowing content.
     Focus stays in the field, which handles the keys (combobox pattern). -->
<Popover.Root {open}>
	<Popover.Content
		customAnchor={input}
		align="start"
		sideOffset={6}
		trapFocus={false}
		onOpenAutoFocus={(event) => event.preventDefault()}
		onCloseAutoFocus={(event) => event.preventDefault()}
		onInteractOutside={(event) => event.target === input && event.preventDefault()}
		class="w-56 gap-0 p-1"
	>
		<ul
			id="{id}-options"
			role="listbox"
			aria-label={workspace.t('ui.ws.inline.tag_suggestions')}
			class="max-h-60 overflow-y-auto"
		>
			{#each options as option, index (option.tag)}
				<!-- Combobox pattern: the field keeps focus and handles the keys (aria-activedescendant). -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{id}-option-{index}"
					role="option"
					aria-selected={index === active}
					class="aria-selected:bg-accent hover:bg-accent flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm"
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => add(option.tag)}
				>
					{#if option.fresh}<Plus class="text-muted-foreground size-3.5" />{workspace.t('ui.ws.inline.tag_new', {
							tag: option.tag,
						})}{:else}<span class="truncate">{option.tag}</span>{/if}
				</li>
			{/each}
		</ul>
	</Popover.Content>
</Popover.Root>
