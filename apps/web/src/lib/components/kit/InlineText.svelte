<script lang="ts">
	import { InlineEditor, type InlineSave } from './inline-edit.svelte';
	import { useWorkspace } from '#lib/workspace.svelte';

	/** Free text (notes, descriptions) edited in place: click to edit, Ctrl/Cmd+Enter or blur saves, Escape restores. */
	let {
		text,
		onsave,
		readonly = false,
	}: { text: { value: string; placeholder: string; label: string }; onsave: InlineSave; readonly?: boolean } = $props();

	const workspace = useWorkspace();
	const editor = new InlineEditor((value) => onsave(value));

	function begin() {
		if (!readonly) editor.start(text.value);
	}

	async function blurCommit() {
		if (!(await editor.commit())) editor.cancel();
	}
</script>

{#if editor.editing}
	<textarea
		class="bg-field ring-ring min-h-24 w-full resize-y rounded-md px-2 py-1.5 text-sm leading-relaxed ring-1 outline-none focus-visible:outline-none"
		aria-label={text.label}
		placeholder={text.placeholder}
		bind:value={editor.draft}
		onkeydown={(event) => editor.keydown(event, true)}
		onblur={blurCommit}
		{@attach (node) => node.focus()}></textarea>
{:else}
	<div
		class="-mx-1 rounded-md px-2 py-1.5 text-sm leading-relaxed whitespace-pre-wrap {readonly
			? ''
			: 'hover:bg-field cursor-text hover:shadow-[0_0_0_1px_var(--input)]'} {text.value ? '' : 'text-muted-foreground'}"
		role="button"
		tabindex={readonly ? -1 : 0}
		aria-disabled={readonly ? 'true' : undefined}
		aria-label={text.label}
		title={readonly ? undefined : workspace.t('ui.ws.inline.edit_hint')}
		onclick={begin}
		onkeydown={(event) => (event.key === 'Enter' ? (event.preventDefault(), begin()) : undefined)}
	>
		{text.value || text.placeholder}
	</div>
{/if}
